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

/*----------------------------------------------------------------------------
**  SpiceConn
**      This is the base Javascript class for establishing and
**  managing a connection to a Spice Server.
**  It is used to provide core functionality to the Spice main,
**  display, inputs, and cursor channels.  See main.js for
**  usage.
**--------------------------------------------------------------------------*/

import { Constants } from './enums.js';
import { SpiceWireReader } from './wire.js';
import {
  SpiceLinkHeader,
  SpiceLinkMess,
  SpiceLinkReply,
  SpiceLinkAuthTicket,
  SpiceLinkAuthReply,
  SpiceMiniData,
  SpiceMsgcDisplayInit,
  SpiceMsgSetAck,
  SpiceMsgcAckSync,
  SpiceMsgNotify,
} from './spicemsg.js';
import { DEBUG } from './utils.js';
import * as Webm from './webm.js';
import { rsa_encrypt } from './ticket.js';
function SpiceConn(o) {
    this.buffer_pool = {};
    
    if (!o || !o.uri) {
        throw new Error("You must specify a uri");
    }

    this.ws = new WebSocket(o.uri, 'binary');
    if (!this.ws.binaryType) {
        throw new Error("WebSocket doesn't support binaryType. Try a different browser.");
    }

    const {
        connection_id = 0,
        type = Constants.SPICE_CHANNEL_MAIN,
        chan_id = 0,
        parent,
        screen_id,
        dump_id,
        message_id,
        password,
        onerror,
        onsuccess,
        onagent
    } = o;

    this.connection_id = connection_id;
    this.type = type;
    this.chan_id = chan_id;
    
    if (parent) {
        this.parent = parent;
        this.message_id = parent.message_id;
        this.password = parent.password;
    }
    
    if (screen_id !== undefined) this.screen_id = screen_id;
    if (dump_id !== undefined) this.dump_id = dump_id;
    if (message_id !== undefined) this.message_id = message_id;
    if (password !== undefined) this.password = password;
    if (onerror !== undefined) this.onerror = onerror;
    if (onsuccess !== undefined) this.onsuccess = onsuccess;
    if (onagent !== undefined) this.onagent = onagent;

    this.state = "connecting";
    this.wire_reader = new SpiceWireReader(this, this.process_inbound);
    this.messages_sent = 0;
    this.warnings = [];

    this._handleOpen = this._handleOpen.bind(this);
    this._handleError = this._handleError.bind(this);
    this._handleClose = this._handleClose.bind(this);

    this.ws.addEventListener('open', this._handleOpen);
    this.ws.addEventListener('error', this._handleError);
    this.ws.addEventListener('close', this._handleClose);

    if (this.ws.readyState === 2 || this.ws.readyState === 3) {
        throw new Error("Unable to connect to " + o.uri);
    }

    this.timeout = window.setTimeout(() => this.handle_timeout(), Constants.SPICE_CONNECT_TIMEOUT);
}

SpiceConn.prototype =
{
    get_buffer : function (size)
    {
    if (!this.buffer_pool[size]) {
        this.buffer_pool[size] = new ArrayBuffer(size);
    }
    return this.buffer_pool[size];
},
    _handleOpen : function() {
        DEBUG > 0 && console.log(">> WebSockets.onopen");
        DEBUG > 0 && console.log(`id ${this.connection_id}; type ${this.type}`);
        
        this.send_hdr();
        this.wire_reader.request(SpiceLinkHeader.prototype.buffer_size());
        this.state = "start";
    },

    _handleError : function(e) {
        if ('url' in e.target) {
            this.log_err(`WebSocket error: Can't connect to websocket on URL: ${e.target.url}`);
        }
        this.report_error(e);
    },

    _handleClose : function(e) {
        DEBUG > 0 && console.log(">> WebSockets.onclose");
        DEBUG > 0 && console.log(`id ${this.connection_id}; type ${this.type}`);
        DEBUG > 0 && console.log(e);

        if (this.state !== "closing" && this.state !== "error" && this.onerror) {
            const errorStates = {
                connecting: "Connection refused.",
                start: "Unexpected protocol mismatch.",
                link: "Unexpected protocol mismatch.",
                ticket: "Bad password.",
            };
            const message = errorStates[this.state] || `Unexpected close while ${this.state}`;
            const error = new Error(message);
            
            this.onerror(error);
            this.log_err(error.toString());
        }
    },
    send_hdr : function ()
    {
        var hdr = new SpiceLinkHeader;
        var msg = new SpiceLinkMess;

        msg.connection_id = this.connection_id;
        msg.channel_type = this.type;
        msg.channel_id = this.chan_id;

        msg.common_caps.push(
            (1 << Constants.SPICE_COMMON_CAP_PROTOCOL_AUTH_SELECTION) |
            (1 << Constants.SPICE_COMMON_CAP_MINI_HEADER)
            );

        if (msg.channel_type == Constants.SPICE_CHANNEL_PLAYBACK)
        {
            var caps = 0;
            if ('MediaSource' in window && MediaSource.isTypeSupported(Webm.Constants.SPICE_PLAYBACK_CODEC))
                caps |= (1 << Constants.SPICE_PLAYBACK_CAP_OPUS);
            msg.channel_caps.push(caps);
        }
        else if (msg.channel_type == Constants.SPICE_CHANNEL_MAIN)
        {
            msg.channel_caps.push(
                (1 << Constants.SPICE_MAIN_CAP_AGENT_CONNECTED_TOKENS)
            );
        }
        else if (msg.channel_type == Constants.SPICE_CHANNEL_DISPLAY)
        {
            var caps =  (1 << Constants.SPICE_DISPLAY_CAP_SIZED_STREAM) |
                        (1 << Constants.SPICE_DISPLAY_CAP_STREAM_REPORT) |
                        (1 << Constants.SPICE_DISPLAY_CAP_MULTI_CODEC) |
                        (1 << Constants.SPICE_DISPLAY_CAP_CODEC_MJPEG);
            if ('MediaSource' in window && MediaSource.isTypeSupported(Webm.Constants.SPICE_VP8_CODEC))
                caps |= (1 << Constants.SPICE_DISPLAY_CAP_CODEC_VP8);
            msg.channel_caps.push(caps);
        }

        hdr.size = msg.buffer_size();

        var mb = new ArrayBuffer(hdr.buffer_size() + msg.buffer_size());
        hdr.to_buffer(mb);
        msg.to_buffer(mb, hdr.buffer_size());

        DEBUG > 1 && console.log("Sending header:");
        DEBUG > 2 && hexdump_buffer(mb);
        this.ws.send(mb);
    },

    send_ticket: function(ticket)
    {
        var hdr = new SpiceLinkAuthTicket();
        hdr.auth_mechanism = Constants.SPICE_COMMON_CAP_AUTH_SPICE;
        // FIXME - we need to implement RSA to make this work right
        hdr.encrypted_data = ticket;
        var mb = new ArrayBuffer(hdr.buffer_size());

        hdr.to_buffer(mb);
        DEBUG > 1 && console.log("Sending ticket:");
        DEBUG > 2 && hexdump_buffer(mb);
        this.ws.send(mb);
    },

    send_msg: function(msg) {
        const size = msg.buffer_size();
        const buffer = this.get_buffer(size);
        msg.to_buffer(buffer);
        this.messages_sent++;
        
        if (DEBUG > 0) {
            console.log(`>> hdr ${this.channel_type()} type ${msg.type} size ${buffer.byteLength}`);
        }
        
        if (DEBUG > 2) {
            hexdump_buffer(buffer);
        }
        
        this.ws.send(buffer);
    },

process_inbound: function(mb, saved_header) {
    const state = this.state;
    const SPICE_MAGIC = Constants.SPICE_MAGIC;
    const SPICE_LINK_ERR_OK = Constants.SPICE_LINK_ERR_OK;
    const SPICE_LINK_ERR_PERMISSION_DENIED = Constants.SPICE_LINK_ERR_PERMISSION_DENIED;
    const miniDataBufferSize = SpiceMiniData.prototype.buffer_size();

    DEBUG > 2 && console.log(this.type + ": processing message of size " + mb.byteLength + "; state is " + state);

    if (state === 'ready') {
        if (!saved_header) {
            const msg = new SpiceMiniData(mb);
            
            if (DEBUG > 0 && msg.type > 500) {
                alert("Something has gone very wrong; we think we have message of type " + msg.type);
                debugger;
            }

            if (msg.size === 0) {
                this.process_message(msg);
                this.wire_reader.request(miniDataBufferSize);
            } else {
                this.wire_reader.request(msg.size);
                this.wire_reader.save_header(msg);
            }
        } else {
            saved_header.data = mb;
            this.process_message(saved_header);
            this.wire_reader.request(miniDataBufferSize);
            this.wire_reader.save_header(undefined);
        }
        return;
    }

    if (state === 'start') {
        const reply_hdr = new SpiceLinkHeader(mb);
        if (reply_hdr.magic !== SPICE_MAGIC) {
            this.state = "error";
            this.report_error(new Error('Error: magic mismatch: ' + reply_hdr.magic));
        } else {
            this.wire_reader.request(reply_hdr.size);
            this.state = "link";
        }
        return;
    }

    if (state === 'link') {
        const reply_link = new SpiceLinkReply(mb);
        if (reply_link.error) {
            this.state = "error";
            this.report_error(new Error('Error: reply link error ' + reply_link.error));
        } else {
            this.send_ticket(rsa_encrypt(reply_link.pub_key, this.password + String.fromCharCode(0)));
            this.state = "ticket";
            this.wire_reader.request(SpiceLinkAuthReply.prototype.buffer_size());
        }
        return;
    }

    if (state === 'ticket') {
        const auth_reply = new SpiceLinkAuthReply(mb);
        if (auth_reply.auth_code === SPICE_LINK_ERR_OK) {
            DEBUG > 0 && console.log(this.type + ': Connected');
            
            if (this.type === Constants.SPICE_CHANNEL_DISPLAY) {
                const dinit = new SpiceMsgcDisplayInit();
                const reply = new SpiceMiniData();
                reply.build_msg(Constants.SPICE_MSGC_DISPLAY_INIT, dinit);
                DEBUG > 0 && console.log("Request display init");
                this.send_msg(reply);
            }
            
            this.state = "ready";
            this.wire_reader.request(miniDataBufferSize);
            
            if (this.timeout) {
                window.clearTimeout(this.timeout);
                delete this.timeout;
            }
        } else {
            this.state = "error";
            const errorMsg = auth_reply.auth_code === SPICE_LINK_ERR_PERMISSION_DENIED
                ? "Permission denied."
                : "Unexpected link error " + auth_reply.auth_code;
            this.report_error(new Error(errorMsg));
        }
    }
},
    process_common_messages: function(msg) {
        const handlers = {
            [Constants.SPICE_MSG_SET_ACK]: () => {
                const ack = new SpiceMsgSetAck(msg.data);
                this.ack_window = ack.window;
                this.msgs_until_ack = this.ack_window;
                
                const ackack = new SpiceMsgcAckSync(ack);
                const reply = new SpiceMiniData();
                reply.build_msg(Constants.SPICE_MSGC_ACK_SYNC, ackack);
                
                DEBUG > 1 && console.log(`${this.type}: set ack to ${ack.window}`);
                this.send_msg(reply);
                return true;
            },
            
            [Constants.SPICE_MSG_PING]: () => {
                DEBUG > 1 && console.log("ping!");
                const pong = new SpiceMiniData();
                pong.type = Constants.SPICE_MSGC_PONG;
                
                if (msg.data) {
                    pong.data = msg.data.slice(0, 12);
                }
                
                pong.size = pong.buffer_size();
                this.send_msg(pong);
                return true;
            },
            
            [Constants.SPICE_MSG_NOTIFY]: () => {
                const notify = new SpiceMsgNotify(msg.data);
                const severityMap = {
                    [Constants.SPICE_NOTIFY_SEVERITY_ERROR]: this.log_err,
                    [Constants.SPICE_NOTIFY_SEVERITY_WARN]: this.log_warn,
                    [Constants.SPICE_NOTIFY_SEVERITY_INFO]: this.log_info
                };
                
                severityMap[notify.severity]?.call(this, notify.message);
                return true;
            }
        };
        
        const handler = handlers[msg.type];
        return handler ? handler.call(this) : false;
    },

    process_message: function(msg) {
        const start = performance.now();
        const channel = this.channel_type();
        let rc = this.process_common_messages(msg);

        if (!rc && this.process_channel_message) {
            rc = this.process_channel_message(msg);
        }

        if (!rc) {
            this.log_err(`${channel}: No message handlers for this channel; message ${msg.type}`);
        }

        if (this.msgs_until_ack !== undefined && this.ack_window) {
            if (--this.msgs_until_ack <= 0) {
                this.msgs_until_ack = this.ack_window;
                const ack = new SpiceMiniData();
                ack.type = Constants.SPICE_MSGC_ACK;
                this.send_msg(ack);
                DEBUG > 1 && console.log(`${this.type}: sent ack`);
            }
        }

        const delta = performance.now() - start;
        if (DEBUG > 0 || delta > Webm.Constants.GAP_DETECTION_THRESHOLD) {
            console.log(`delta ${channel}:${msg.type} ${delta.toFixed(2)}ms`);
        }

        return rc;
    },

    log_info: function()
    {
        var msg = Array.prototype.join.call(arguments, " ");
        console.log(msg);
        if (this.message_id)
        {
            var p = document.createElement("p");
            p.appendChild(document.createTextNode(msg));
            p.className += "spice-message-info";
            document.getElementById(this.message_id).appendChild(p);
        }
    },

    log_warn: function()
    {
        var msg = Array.prototype.join.call(arguments, " ");
        console.log("WARNING: " + msg);
        if (this.message_id)
        {
            var p = document.createElement("p");
            p.appendChild(document.createTextNode(msg));
            p.className += "spice-message-warning";
            document.getElementById(this.message_id).appendChild(p);
        }
    },

    log_err: function()
    {
        var msg = Array.prototype.join.call(arguments, " ");
        console.log("ERROR: " + msg);
        if (this.message_id)
        {
            var p = document.createElement("p");
            p.appendChild(document.createTextNode(msg));
            p.className += "spice-message-error";
            document.getElementById(this.message_id).appendChild(p);
        }
    },

    known_unimplemented: function(type, msg)
    {
        if ( (!this.warnings[type]) || DEBUG > 1)
        {
            var str = "";
            if (DEBUG <= 1)
                str = " [ further notices suppressed ]";
            this.log_warn("Unimplemented function " + type + "(" + msg + ")" + str);
            this.warnings[type] = true;
        }
    },

    report_error: function(e)
    {
        this.log_err(e.toString());
        if (this.onerror != undefined)
            this.onerror(e);
        else
            throw(e);
    },

    report_success: function(m)
    {
        if (this.onsuccess != undefined)
            this.onsuccess(m);
    },

    cleanup: function()
    {
        if (this.timeout)
        {
            window.clearTimeout(this.timeout);
            delete this.timeout;
        }
        if (this.ws)
        {
            this.ws.close();
            this.ws = undefined;
        }
    },

    handle_timeout: function()
    {
        var e = new Error("Connection timed out.");
        this.report_error(e);
    },
}

SpiceConn.prototype.channelTypeMap = {
    [Constants.SPICE_CHANNEL_MAIN]: "main",
    [Constants.SPICE_CHANNEL_DISPLAY]: "display",
    [Constants.SPICE_CHANNEL_INPUTS]: "inputs",
    [Constants.SPICE_CHANNEL_CURSOR]: "cursor",
    [Constants.SPICE_CHANNEL_PLAYBACK]: "playback",
    [Constants.SPICE_CHANNEL_RECORD]: "record",
    [Constants.SPICE_CHANNEL_TUNNEL]: "tunnel",
    [Constants.SPICE_CHANNEL_SMARTCARD]: "smartcard",
    [Constants.SPICE_CHANNEL_USBREDIR]: "usbredir",
    [Constants.SPICE_CHANNEL_PORT]: "port",
    [Constants.SPICE_CHANNEL_WEBDAV]: "webdav"
};

SpiceConn.prototype.channel_type = function() {
    return this.channelTypeMap[this.type] || `unknown-${this.type}`;
};

function spiceconn_timeout(sc)
{
    SpiceConn.prototype.handle_timeout.call(sc);
}

export {
  SpiceConn,
};
