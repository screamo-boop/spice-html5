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
import { KeyNames, keyCodeMap } from './atKeynames.js';
import { SpiceConn } from './spiceconn.js';
import { DEBUG } from './utils.js';

/*----------------------------------------------------------------------------
 ** Modifier Keystates
 **     These need to be tracked because focus in and out can get the keyboard
 **     out of sync.
 **------------------------------------------------------------------------*/
var Shift_state = -1;
var Ctrl_state = -1;
var Alt_state = -1;
var Meta_state = -1;
var CapsLock_state = -1;
/*----------------------------------------------------------------------------
**  SpiceInputsConn
**      Drive the Spice Inputs channel (e.g. mouse + keyboard)
**--------------------------------------------------------------------------*/
function SpiceInputsConn()
{
    SpiceConn.apply(this, arguments);

    this.mousex = undefined;
    this.mousey = undefined;
    this.button_state = 0;
    this.waiting_for_ack = 0;
}

SpiceInputsConn.prototype = Object.create(SpiceConn.prototype);

SpiceInputsConn.prototype.process_channel_message = function(msg) {
    switch (msg.type) {
        case Constants.SPICE_MSG_INPUTS_INIT: {
            const inputs_init = new Messages.SpiceMsgInputsInit(msg.data);
            this.keyboard_modifiers = inputs_init.keyboard_modifiers;
            DEBUG > 1 && console.log("MsgInputsInit - modifier " + this.keyboard_modifiers);
            return true;
        }
        case Constants.SPICE_MSG_INPUTS_KEY_MODIFIERS: {
            const key = new Messages.SpiceMsgInputsKeyModifiers(msg.data);
            this.keyboard_modifiers = key.keyboard_modifiers;
            DEBUG > 1 && console.log("MsgInputsKeyModifiers - modifier " + this.keyboard_modifiers);
            return true;
        }
        case Constants.SPICE_MSG_INPUTS_MOUSE_MOTION_ACK: {
            DEBUG > 1 && console.log("mouse motion ack");
            this.waiting_for_ack -= Constants.SPICE_INPUT_MOTION_ACK_BUNCH;
            return true;
        }
        default:
            return false;
    }
};




function handle_mousemove(e) {
    if (!this.sc) return;

    const { sc } = this;
    const isClientMouseMode = sc.mouse_mode === Constants.SPICE_MOUSE_MODE_CLIENT;
    const move = isClientMouseMode
        ? new Messages.SpiceMsgcMousePosition(sc, e)
        : new Messages.SpiceMsgcMouseMotion(sc, e);
    
    const buildMessageType = isClientMouseMode 
        ? Constants.SPICE_MSGC_INPUTS_MOUSE_POSITION 
        : Constants.SPICE_MSGC_INPUTS_MOUSE_MOTION;

    const msg = new Messages.SpiceMiniData();
    msg.build_msg(buildMessageType, move);

    if (sc.inputs?.state === "ready") {
        const { waiting_for_ack } = sc.inputs;
        const ackLimit = 2 * Constants.SPICE_INPUT_MOTION_ACK_BUNCH;
        if (waiting_for_ack < ackLimit) {
            sc.inputs.send_msg(msg);
            sc.inputs.waiting_for_ack++;
        } else if (DEBUG > 0) {
            sc.log_info("Discarding mouse motion");
        }
    }

    const cursor = sc.cursor?.spice_simulated_cursor;
    if (cursor) {
        cursor.style.display = 'block';
        cursor.style.left = `${e.pageX - cursor.spice_hot_x}px`;
        cursor.style.top = `${e.pageY - cursor.spice_hot_y}px`;
        e.preventDefault();
    }
}


function handle_mousedown(e)
{
    var press = new Messages.SpiceMsgcMousePress(this.sc, e)
    var msg = new Messages.SpiceMiniData();
    msg.build_msg(Constants.SPICE_MSGC_INPUTS_MOUSE_PRESS, press);
    if (this.sc && this.sc.inputs && this.sc.inputs.state === "ready")
        this.sc.inputs.send_msg(msg);

    e.preventDefault();
}

function handle_contextmenu(e)
{
    e.preventDefault();
    return false;
}

function handle_mouseup(e) {
    if (!this.sc || this.sc.inputs?.state !== "ready") return;

    const release = new Messages.SpiceMsgcMouseRelease(this.sc, e);
    const msg = new Messages.SpiceMiniData();
    msg.build_msg(Constants.SPICE_MSGC_INPUTS_MOUSE_RELEASE, release);
    
    this.sc.inputs.send_msg(msg);
    e.preventDefault();
}



function handle_mousewheel(e) {
    if (!this.sc || this.sc.inputs?.state !== "ready") return;
    
    const isScrollUp = e.deltaY < 0;
    const button = isScrollUp ? Constants.SPICE_MOUSE_BUTTON_UP : Constants.SPICE_MOUSE_BUTTON_DOWN;

    const press = new Messages.SpiceMsgcMousePress();
    press.button = button;
    press.buttons_state = 0;

    const release = new Messages.SpiceMsgcMouseRelease();
    release.button = button;
    release.buttons_state = 0;

    const msg = new Messages.SpiceMiniData();
    
    msg.build_msg(Constants.SPICE_MSGC_INPUTS_MOUSE_PRESS, press);
    this.sc.inputs.send_msg(msg);
    
    msg.build_msg(Constants.SPICE_MSGC_INPUTS_MOUSE_RELEASE, release);
    this.sc.inputs.send_msg(msg);
    
    e.preventDefault();
}


function handle_keydown(e) {
    if (!this.sc || this.sc.inputs?.state !== "ready") return;
    const key = new Messages.SpiceMsgcKeyDown(e);
    check_and_update_modifiers(e, key.code, this.sc);
    const msg = new Messages.SpiceMiniData();
    msg.build_msg(Constants.SPICE_MSGC_INPUTS_KEY_DOWN, key);
    this.sc.inputs.send_msg(msg);
    e.preventDefault();
}

function handle_keyup(e) {
    if (!this.sc || this.sc.inputs?.state !== "ready") return;
    const key = new Messages.SpiceMsgcKeyUp(e);
    check_and_update_modifiers(e, key.code, this.sc);
    const msg = new Messages.SpiceMiniData();
    msg.build_msg(Constants.SPICE_MSGC_INPUTS_KEY_UP, key);
    this.sc.inputs.send_msg(msg);
    e.preventDefault();
}

async function simulateClipboardTyping(sc) {
    try {
        const clipboardText = await navigator.clipboard.readText();

        const shiftRequiredRegex = /[A-Z!@#$%^&*()_+{}:"<>?|~]/;

        for (const char of clipboardText) {
            if (char === '\n') {
                const enterKeyCode = 13;

                const enterKeyDownEvent = new KeyboardEvent('keydown', {
                    key: 'Enter',
                    keyCode: enterKeyCode,
                    target: "canvas#spice_surface_0"
                });
                const enterKeyDown = new Messages.SpiceMsgcKeyDown(enterKeyDownEvent);
                const msg = new Messages.SpiceMiniData();
                msg.build_msg(Constants.SPICE_MSGC_INPUTS_KEY_DOWN, enterKeyDown);
                sc.inputs.send_msg(msg);

                const enterKeyUpEvent = new KeyboardEvent('keyup', {
                    key: 'Enter',
                    keyCode: enterKeyCode,
                    target: "canvas#spice_surface_0"
                });
                const enterKeyUp = new Messages.SpiceMsgcKeyUp(enterKeyUpEvent);
                msg.build_msg(Constants.SPICE_MSGC_INPUTS_KEY_UP, enterKeyUp);
                sc.inputs.send_msg(msg);

                await new Promise(resolve => setTimeout(resolve, 1));
                continue;
            }

            const isShiftRequired = shiftRequiredRegex.test(char);

            if (isShiftRequired) {
                const shiftKeyDownEvent = new KeyboardEvent('keydown', {
                    key: 'Shift',
                    keyCode: 16,
                    target: "canvas#spice_surface_0"
                });
                const shiftKeyDown = new Messages.SpiceMsgcKeyDown(shiftKeyDownEvent);
                const msg = new Messages.SpiceMiniData();
                msg.build_msg(Constants.SPICE_MSGC_INPUTS_KEY_DOWN, shiftKeyDown);
                sc.inputs.send_msg(msg);
            }

            const keyCode = keyCodeMap[char];
            const keyDownEvent = new KeyboardEvent('keydown', {
                key: char,
                keyCode: keyCode,
                target: "canvas#spice_surface_0"
            });
            const key = new Messages.SpiceMsgcKeyDown(keyDownEvent);
            const msg = new Messages.SpiceMiniData();
            msg.build_msg(Constants.SPICE_MSGC_INPUTS_KEY_DOWN, key);
            sc.inputs.send_msg(msg);

            const keyUpEvent = new KeyboardEvent('keyup', {
                key: char,
                keyCode: keyCode,
                target: "canvas#spice_surface_0"
            });
            const keyup = new Messages.SpiceMsgcKeyUp(keyUpEvent);
            msg.build_msg(Constants.SPICE_MSGC_INPUTS_KEY_UP, keyup);
            sc.inputs.send_msg(msg);

            if (isShiftRequired) {
                const shiftKeyUpEvent = new KeyboardEvent('keyup', {
                    key: 'Shift',
                    keyCode: 16,
                    target: "canvas#spice_surface_0"
                });
                const shiftKeyUp = new Messages.SpiceMsgcKeyUp(shiftKeyUpEvent);
                msg.build_msg(Constants.SPICE_MSGC_INPUTS_KEY_UP, shiftKeyUp);
                sc.inputs.send_msg(msg);
            }
            await new Promise(resolve => setTimeout(resolve, 1));
        }
    } catch (err) {
        console.error('Failed to read clipboard contents: ', err);
    }
}

function sendCtrlAltDel(sc) {
    if (sc && sc.inputs && sc.inputs.state === "ready") {
        var key = new Messages.SpiceMsgcKeyDown();
        var msg = new Messages.SpiceMiniData();

        update_modifier(true, KeyNames.KEY_LCtrl, sc);
        update_modifier(true, KeyNames.KEY_Alt, sc);

        key.code = KeyNames.KEY_KP_Decimal;
        msg.build_msg(Constants.SPICE_MSGC_INPUTS_KEY_DOWN, key);
        sc.inputs.send_msg(msg);
        msg.build_msg(Constants.SPICE_MSGC_INPUTS_KEY_UP, key);
        sc.inputs.send_msg(msg);

        update_modifier(false, KeyNames.KEY_LCtrl, sc);
        update_modifier(false, KeyNames.KEY_Alt, sc);
        update_modifier(true, KeyNames.KEY_ShiftL, sc)
    }
}

function sendCtrlAltF(sc, fNumber) {
    if (sc && sc.inputs && sc.inputs.state === "ready") {
        if (fNumber < 1 || fNumber > 10) {
            console.error("Invalid function key number. Must be between 1 and 10.");
            return;
        }

        var key = new Messages.SpiceMsgcKeyDown();
        var msg = new Messages.SpiceMiniData();

        update_modifier(true, KeyNames.KEY_LCtrl, sc);
        update_modifier(true, KeyNames.KEY_Alt, sc);

        var functionKeyCode = KeyNames.KEY_F1 + (fNumber - 1);

        key.code = functionKeyCode;
        msg.build_msg(Constants.SPICE_MSGC_INPUTS_KEY_DOWN, key);
        sc.inputs.send_msg(msg);
        msg.build_msg(Constants.SPICE_MSGC_INPUTS_KEY_UP, key);
        sc.inputs.send_msg(msg);

        update_modifier(false, KeyNames.KEY_LCtrl, sc);
        update_modifier(false, KeyNames.KEY_Alt, sc);
    }
}

function update_modifier(isKeyDown, keyCode, spiceClient) {
    const message = new Messages.SpiceMiniData();
    const keyMessage = isKeyDown 
        ? new Messages.SpiceMsgcKeyDown() 
        : new Messages.SpiceMsgcKeyUp();

    keyMessage.code = isKeyDown ? keyCode : (0x80 | keyCode);

    const messageType = isKeyDown 
        ? Constants.SPICE_MSGC_INPUTS_KEY_DOWN 
        : Constants.SPICE_MSGC_INPUTS_KEY_UP;

    message.build_msg(messageType, keyMessage);

    spiceClient.inputs.send_msg(message);
}


function check_and_update_modifiers(e, code, sc) {
    if (Shift_state === -1) {
        Shift_state = e.shiftKey;
        Ctrl_state = e.ctrlKey;
        Alt_state = e.altKey;
        Meta_state = e.metaKey;
    }

    const keyMappings = {
        [KeyNames.KEY_ShiftL]: () => Shift_state = true,
        [KeyNames.KEY_Alt]: () => Alt_state = true,
        [KeyNames.KEY_LCtrl]: () => Ctrl_state = true,
        [KeyNames.KEY_CapsLock]: () => CapsLock_state = true,
        0xE0B5: () => Meta_state = true,
        [(0x80 | KeyNames.KEY_ShiftL)]: () => Shift_state = false,
        [(0x80 | KeyNames.KEY_Alt)]: () => Alt_state = false,
        [(0x80 | KeyNames.KEY_LCtrl)]: () => Ctrl_state = false,
        [(0x80 | KeyNames.KEY_CapsLock)]: () => CapsLock_state = false,
        [(0x80 | 0xE0B5)]: () => Meta_state = false
    };

    if (keyMappings[code]) keyMappings[code]();

    if (sc && sc.inputs && sc.inputs.state === "ready") {
        const modifierStates = [
            { state: Shift_state, key: e.shiftKey, name: "Shift", code: KeyNames.KEY_ShiftL },
            { state: Alt_state, key: e.altKey, name: "Alt", code: KeyNames.KEY_Alt },
            { state: Ctrl_state, key: e.ctrlKey, name: "Ctrl", code: KeyNames.KEY_LCtrl },
            { state: CapsLock_state, key: e.capsLockKey, name: "CapsLock", code: KeyNames.KEY_CapsLock },
            { state: Meta_state, key: e.metaKey, name: "Meta", code: 0xE0B5 }
        ];

        modifierStates.forEach(modifier => {
            if (modifier.state !== modifier.key) {
                update_modifier(modifier.key, modifier.code, sc);
                modifier.state = modifier.key;
            }
        });
    }
}


export {
  SpiceInputsConn,
  handle_mousemove,
  handle_mousedown,
  handle_contextmenu,
  handle_mouseup,
  handle_mousewheel,
  handle_keydown,
  handle_keyup,
  sendCtrlAltDel,
  simulateClipboardTyping,
  sendCtrlAltF,
};