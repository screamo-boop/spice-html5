"use strict";

/*
   Copyright (C) 2012 by Jeremy P. White <jwhite@codeweavers.com>

   This file is part of spice-html5.

   spice-html5 is free software: you can redistribute it and/or modify
   it under the terms of the GNU Lesser General Public License as published by
   the Free Software Foundation, either version 3 of the License, or
   (at your option) any later version.

   spice-html5 is distributed in the hope that it will be useful,
   but WITHOUT ANY WARRANTY; without even the implied warranty of
   MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
   GNU Lesser General Public License for more details.

   You should have received a copy of the GNU Lesser General Public License
   along with spice-html5.  If not, see <http://www.gnu.org/licenses/>.
*/


import * as Messages from './spicemsg.js';
import { Constants } from './enums.js';
import { SpiceCursorConn } from './cursor.js';
import { SpiceConn } from './spiceconn.js';
import { DEBUG } from './utils.js';
import { SpiceFileXferTask } from './filexfer.js';
import { SpiceInputsConn, sendCtrlAltDel, simulateClipboardTyping, sendCtrlAltF } from './inputs.js';
import { SpiceDisplayConn } from './display.js';
import { SpicePlaybackConn } from './playback.js';
import { SpicePortConn } from './port.js';
import { handle_file_dragover, handle_file_drop } from './filexfer.js';
import { resize_helper, handle_resize } from './resize.js';

class SpiceMainConn extends SpiceConn {
    constructor(options) {
        if (typeof WebSocket === "undefined") {
            throw new Error("WebSocket unavailable. Use a modern browser.");
        }
        super(options);
        this.agentMsgQueue = [];
        this.fileXferTasks = new Map();
        this.fileXferTaskId = 0;
        this.fileXferReadQueue = [];
        this.ports = [];
    }

    process_channel_message(msg) {
        switch (msg.type) {
            case Constants.SPICE_MSG_MAIN_INIT: {
                const init = new Messages.SpiceMsgMainInit(msg.data);
                this.connection_id = init.session_id;
                this.agent_tokens = init.agent_tokens;
                this.handleMainInit(init);
                return true;
            }
            case Constants.SPICE_MSG_MAIN_MOUSE_MODE: {
                const mode = new Messages.SpiceMsgMainMouseMode(msg.data);
                this.handle_mouse_mode(mode.current_mode, mode.supported_modes);
                DEBUG > 0 && this.log_info(`Mouse supported modes: ${mode.supported_modes}, current: ${mode.current_mode}`);
                return true;
            }
            case Constants.SPICE_MSG_MAIN_CHANNELS_LIST: {
                this.handleChannelsList(new Messages.SpiceMsgChannels(msg.data));
                return true;
            }
            case Constants.SPICE_MSG_MAIN_AGENT_CONNECTED:
            case Constants.SPICE_MSG_MAIN_AGENT_CONNECTED_TOKENS: {
                if (msg.type === Constants.SPICE_MSG_MAIN_AGENT_CONNECTED_TOKENS) {
                    const tokens = new Messages.SpiceMsgMainAgentTokens(msg.data);
                    this.agent_tokens = tokens.num_tokens;
                }
                this.connect_agent();
                return true;
            }
            case Constants.SPICE_MSG_MAIN_AGENT_TOKEN: {
                const tokens = new Messages.SpiceMsgMainAgentTokens(msg.data);
                this.agent_tokens += tokens.num_tokens;
                this.send_agent_message_queue();
                this.processFileXferQueue();
                return true;
            }
            case Constants.SPICE_MSG_MAIN_AGENT_DISCONNECTED: {
                this.agent_connected = false;
                return true;
            }
            case Constants.SPICE_MSG_MAIN_AGENT_DATA: {
                const data = new Messages.SpiceMsgMainAgentData(msg.data);
                return this.handleAgentData(data);
            }
            default:
                this.handleUnimplemented(msg.type);
                return true;
        }
    }

    stop() {
        this.state = "closing";
        this.cleanupConnections();
        super.cleanup();
    }

    send_agent_message_queue(message) {
        if (!this.agent_connected) return;
        if (message) this.agentMsgQueue.push(message);

        while (this.agent_tokens > 0 && this.agentMsgQueue.length > 0) {
            const msg = this.agentMsgQueue.shift();
            this.send_msg(msg);
            this.agent_tokens--;
        }
    }

    send_agent_message(type, message) {
        const agentData = new Messages.SpiceMsgcMainAgentData(type, message);
        const maxSize = Constants.VD_AGENT_MAX_DATA_SIZE - Messages.SpiceMiniData.prototype.buffer_size();
        const buffer = new ArrayBuffer(agentData.buffer_size());
        agentData.to_buffer(buffer);
        let offset = 0;

        while (offset < buffer.byteLength) {
            const end = Math.min(offset + maxSize, buffer.byteLength);
            const chunk = new Messages.SpiceMiniData();
            chunk.type = Constants.SPICE_MSGC_MAIN_AGENT_DATA;
            chunk.size = end - offset;
            chunk.data = buffer.slice(offset, end);
            this.send_agent_message_queue(chunk);
            offset = end;
        }
    }

    announce_agent_capabilities(request) {
        const caps = new Messages.VDAgentAnnounceCapabilities(request, 
            (1 << Constants.VD_AGENT_CAP_MOUSE_STATE) |
            (1 << Constants.VD_AGENT_CAP_MONITORS_CONFIG) |
            (1 << Constants.VD_AGENT_CAP_REPLY)
        );
        this.send_agent_message(Constants.VD_AGENT_ANNOUNCE_CAPABILITIES, caps);
    }

    resize_window(flags, width, height, depth, x, y) {
        const config = new Messages.VDAgentMonitorsConfig(flags, width, height, depth, x, y);
        this.send_agent_message(Constants.VD_AGENT_MONITORS_CONFIG, config);
    }

    file_xfer_start(file) {
        const taskId = this.fileXferTaskId++;
        const task = new SpiceFileXferTask(taskId, file);
        task.create_progressbar();
        this.fileXferTasks.set(taskId, task);
        const startMsg = new Messages.VDAgentFileXferStartMessage(taskId, file.name, file.size);
        this.send_agent_message(Constants.VD_AGENT_FILE_XFER_START, startMsg);
    }

    file_xfer_read(task, startByte = 0) {
        const chunkSize = 32 * Constants.VD_AGENT_MAX_DATA_SIZE;
        if (!task || !this.fileXferTasks.has(task.id) || (startByte > 0 && startByte === task.file.size)) {
            return;
        }

        if (task.cancelled) {
            this.cancelFileXfer(task);
            return;
        }

        const start = startByte;
        const end = Math.min(start + chunkSize, task.file.size);

        if (!this.agent_tokens) {
            task.read_bytes = start;
            this.fileXferReadQueue.push(task);
            return;
        }

        const slice = task.file.slice(start, end);
        const reader = new FileReader();
        reader.onload = (e) => {
            const data = new Messages.VDAgentFileXferDataMessage(task.id, e.target.result.byteLength, e.target.result);
            this.send_agent_message(Constants.VD_AGENT_FILE_XFER_DATA, data);
            this.file_xfer_read(task, end);
            task.update_progressbar(end);
        };
        reader.readAsArrayBuffer(slice);
    }

    file_xfer_completed(task, error) {
        if (error) {
            this.log_err(error);
        } else {
            this.log_info(`File '${task.file.name}' transferred successfully`);
            setTimeout(() => task.remove_progressbar(), 3000);
        }
        this.fileXferTasks.delete(task.id);
    }

    connect_agent() {
        this.agent_connected = true;
        const start = new Messages.SpiceMsgcMainAgentStart(~0);
        const startMsg = new Messages.SpiceMiniData();
        startMsg.build_msg(Constants.SPICE_MSGC_MAIN_AGENT_START, start);
        this.send_msg(startMsg);
        this.announce_agent_capabilities(1);
        this.onagent?.(this);
    }

    handle_mouse_mode(current, supported) {
        this.mouse_mode = current;
        if (current !== Constants.SPICE_MOUSE_MODE_CLIENT && (supported & Constants.SPICE_MOUSE_MODE_CLIENT)) {
            const request = new Messages.SpiceMsgcMainMouseModeRequest(Constants.SPICE_MOUSE_MODE_CLIENT);
            const msg = new Messages.SpiceMiniData();
            msg.build_msg(Constants.SPICE_MSGC_MAIN_MOUSE_MODE_REQUEST, request);
            this.send_msg(msg);
        }
        if (this.inputs) this.inputs.mouse_mode = current;
    }

    relative_now() {
        return (Date.now() - this.our_mm_time) + this.mm_time;
    }

    handleMainInit(init) {
        this.log_info(`Connected to ${this.ws.url}`);
        this.report_success("Connected");
        this.our_mm_time = Date.now();
        this.mm_time = init.multi_media_time;
        this.handle_mouse_mode(init.current_mouse_mode, init.supported_mouse_modes);
        if (init.agent_connected) this.connect_agent();
        const attachMsg = new Messages.SpiceMiniData();
        attachMsg.type = Constants.SPICE_MSGC_MAIN_ATTACH_CHANNELS;
        this.send_msg(attachMsg);
    }

    handleChannelsList(chans) {
        for (const { type, id } of chans.channels) {
            const conn = { uri: this.ws.url, parent: this, connection_id: this.connection_id, type, chan_id: id };
            switch (type) {
                case Constants.SPICE_CHANNEL_DISPLAY:
                    if (id === 0) {
                        this.display = new SpiceDisplayConn(conn);
                    } else {
                        this.log_warn("Multiple heads not supported.");
                    }
                    break;
                case Constants.SPICE_CHANNEL_INPUTS:
                    this.inputs = new SpiceInputsConn(conn);
                    this.inputs.mouse_mode = this.mouse_mode;
                    break;
                case Constants.SPICE_CHANNEL_CURSOR:
                    this.cursor = new SpiceCursorConn(conn);
                    break;
                case Constants.SPICE_CHANNEL_PLAYBACK:
                    this.playback = new SpicePlaybackConn(conn);
                    break;
                case Constants.SPICE_CHANNEL_PORT:
                    this.ports.push(new SpicePortConn(conn));
                    break;
                default:
                    this.extra_channels = this.extra_channels || [];
                    this.extra_channels.push(new SpiceConn(conn));
                    this.log_err(`Channel type ${type} not implemented`);
            }
        }
    }

    handleAgentData(data) {
        switch (data.type) {
            case Constants.VD_AGENT_ANNOUNCE_CAPABILITIES: {
                const caps = new Messages.VDAgentAnnounceCapabilities(data.data);
                if (caps.request) this.announce_agent_capabilities(0);
                return true;
            }
            case Constants.VD_AGENT_FILE_XFER_STATUS: {
                this.handle_file_xfer_status(new Messages.VDAgentFileXferStatusMessage(data.data));
                return true;
            }
            default:
                return false;
        }
    }

    handle_file_xfer_status(status) {
        const task = this.fileXferTasks.get(status.id);
        if (!task) return;

        switch (status.result) {
            case Constants.VD_AGENT_FILE_XFER_STATUS_CAN_SEND_DATA:
                this.file_xfer_read(task);
                break;
            case Constants.VD_AGENT_FILE_XFER_STATUS_CANCELLED:
                task.show_message("Transfer cancelled", true);
                this.file_xfer_completed(task, "Transfer cancelled");
                break;
            case Constants.VD_AGENT_FILE_XFER_STATUS_ERROR:
                task.show_message("Transfer error", true);
                this.file_xfer_completed(task, "Transfer error");
                break;
            case Constants.VD_AGENT_FILE_XFER_STATUS_SUCCESS:
                task.show_message("Transfer completed successfully", false);
                this.file_xfer_completed(task);
                break;
            default:
                task.show_message(`Unknown error: ${status.result}`, true);
                this.file_xfer_completed(task, `Unknown error: ${status.result}`);
        }
    }

    cleanupConnections() {
        this.inputs?.cleanup();
        this.inputs = undefined;
        this.cursor?.cleanup();
        this.cursor = undefined;
        if (this.display) {
            this.display.cleanup();
            this.display.destroy_surfaces();
            this.display = undefined;
        }
        this.playback?.cleanup();
        this.playback = undefined;
        this.ports.forEach(port => port.cleanup());
        this.ports = [];
        if (this.extra_channels) {
            this.extra_channels.forEach(channel => channel.cleanup());
            this.extra_channels = undefined;
        }
    }

    processFileXferQueue() {
        while (this.agent_tokens > 0 && this.fileXferReadQueue.length > 0) {
            const task = this.fileXferReadQueue.shift();
            this.file_xfer_read(task, task.read_bytes);
            this.agent_tokens--;
        }
    }

    cancelFileXfer(task) {
        const status = new Messages.VDAgentFileXferStatusMessage(task.id, Constants.VD_AGENT_FILE_XFER_STATUS_CANCELLED);
        this.send_agent_message(Constants.VD_AGENT_FILE_XFER_STATUS, status);
        this.fileXferTasks.delete(task.id);
    }

    handleUnimplemented(type) {
        const names = {
            [Constants.SPICE_MSG_MAIN_MIGRATE_BEGIN]: "Main Migrate Begin",
            [Constants.SPICE_MSG_MAIN_MIGRATE_CANCEL]: "Main Migrate Cancel",
            [Constants.SPICE_MSG_MAIN_MULTI_MEDIA_TIME]: "Main Multi Media Time",
            [Constants.SPICE_MSG_MAIN_MIGRATE_SWITCH_HOST]: "Main Migrate Switch Host",
            [Constants.SPICE_MSG_MAIN_MIGRATE_END]: "Main Migrate End",
            [Constants.SPICE_MSG_MAIN_NAME]: "Main Name",
            [Constants.SPICE_MSG_MAIN_UUID]: "Main UUID",
            [Constants.SPICE_MSG_MAIN_MIGRATE_BEGIN_SEAMLESS]: "Main Migrate Begin Seamless",
            [Constants.SPICE_MSG_MAIN_MIGRATE_DST_SEAMLESS_ACK]: "Main Migrate Dst Seamless ACK",
            [Constants.SPICE_MSG_MAIN_MIGRATE_DST_SEAMLESS_NACK]: "Main Migrate Dst Seamless NACK"
        };
        this.known_unimplemented(type, names[type] || "Unknown");
    }
}

export {
    SpiceMainConn,
    handle_file_dragover,
    handle_file_drop,
    resize_helper,
    handle_resize,
    sendCtrlAltDel,
    simulateClipboardTyping,
    sendCtrlAltF
};