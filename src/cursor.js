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

import { create_rgba_png } from './png.js';
import { Constants } from './enums.js';
import { DEBUG } from './utils.js';
import {
  SpiceMsgCursorInit,
  SpiceMsgCursorSet,
} from './spicemsg.js';
import { SpiceSimulateCursor } from './simulatecursor.js';
import { SpiceConn } from './spiceconn.js';

/*----------------------------------------------------------------------------
**  SpiceCursorConn
**      Drive the Spice Cursor Channel
**--------------------------------------------------------------------------*/
class SpiceCursorConn extends SpiceConn {
    process_channel_message(msg) {
        switch (msg.type) {
            case Constants.SPICE_MSG_CURSOR_INIT:
                return this.handleCursorInit(msg);
            case Constants.SPICE_MSG_CURSOR_SET:
                return this.handleCursorSet(msg);
            case Constants.SPICE_MSG_CURSOR_MOVE:
                this.known_unimplemented(msg.type, "Cursor Move");
                return true;
            case Constants.SPICE_MSG_CURSOR_HIDE:
                return this.hideCursor();
            case Constants.SPICE_MSG_CURSOR_TRAIL:
                this.known_unimplemented(msg.type, "Cursor Trail");
                return true;
            case Constants.SPICE_MSG_CURSOR_RESET:
                return this.resetCursor();
            case Constants.SPICE_MSG_CURSOR_INVAL_ONE:
                this.known_unimplemented(msg.type, "Cursor Inval One");
                return true;
            case Constants.SPICE_MSG_CURSOR_INVAL_ALL:
                DEBUG > 1 && console.log("SpiceMsgCursorInvalAll");
                // FIXME - There may be something useful to do here...
                return true;
            default:
                return false;
        }
    }

    align(value, alignment) {
        return (value + alignment - 1) & ~(alignment - 1);
    }

    handleCursorInit(msg) {
        const cursor_init = new SpiceMsgCursorInit(msg.data);
        DEBUG > 1 && console.log("SpiceMsgCursorInit");
        
        if (this.parent?.inputs?.mouse_mode === Constants.SPICE_MOUSE_MODE_SERVER) {
            this.parent.inputs.mousex = cursor_init.position.x;
            this.parent.inputs.mousey = cursor_init.position.y;
        }

        // FIXME - We don't handle most of the parameters here...
        return true;
    }

	mono_image_to_data(bytes, width, height) {
        const monoMask = [1, 2, 4, 8, 16, 32, 64, 128]
		let stride = this.align(width, 8) >>> 3;
		let length = bytes.length;
		let half = length / 2;

		const canvas = document.createElement('canvas');
		const context = canvas.getContext('2d');

		let result = context.createImageData(width, height);

		let andMask = [];
		let xorMask = [];

		for (let i = 0; i < length; i++) {
			let currentByte = bytes[i];
		    let bitsLeft = 8;

			if (i >= half) {
				while (bitsLeft--) {
					let bit = (currentByte & monoMask[bitsLeft]) && true;
					andMask.push(bit);
				}
			} else if (i < half) {
				while (bitsLeft--) {
					let bit = (currentByte & monoMask[bitsLeft]) && true;
					xorMask.push(bit);
				}
			}
		}

		let pos = 0;
		half = xorMask.length;

		for (let i = 0; i < half; i++) {
			pos = i * 4;
			if (!andMask[i] && !xorMask[i]) {
				result.data[pos] = 0;
				result.data[pos + 1] = 0;
				result.data[pos + 2] = 0;
				result.data[pos + 3] = 255;
			} else if (!andMask[i] && xorMask[i]) {
				result.data[pos] = 255;
				result.data[pos + 1] = 255;
				result.data[pos + 2] = 255;
				result.data[pos + 3] = 0;
			} else if (andMask[i] && !xorMask[i]) {
				result.data[pos] = 255;
				result.data[pos + 1] = 255;
				result.data[pos + 2] = 255;
				result.data[pos + 3] = 255;
			} else if (andMask[i] && xorMask[i]) {
				result.data[pos] = 0;
				result.data[pos + 1] = 0;
				result.data[pos + 2] = 0;
				result.data[pos + 3] = 255;
			}
		}
		return result;
	}




handleCursorSet(msg) {
    const cursor_set = new SpiceMsgCursorSet(msg.data);
    DEBUG > 1 && console.log("SpiceMsgCursorSet");

    if (cursor_set.flags & Constants.SPICE_CURSOR_FLAGS_NONE) {
        this.setCursorStyle("none");
        return true;
    }

    if (cursor_set.flags > 0) {
        this.log_warn(`FIXME: No support for cursor flags ${cursor_set.flags}`);
    }

    const cursor = cursor_set.cursor;
    const { width, height, hot_spot_x, hot_spot_y } = cursor.header;

    if (cursor.header.type === Constants.SPICE_CURSOR_TYPE_ALPHA) {
        this.set_cursor(cursor);
    } else if (cursor.header.type === Constants.SPICE_CURSOR_TYPE_MONO) {
        this.set_cursor_mono(cursor);
    } else {
        this.log_warn(`Unsupported cursor type: ${cursor.header.type}`);
    }

    return true;
}



    hideCursor() {
        DEBUG > 1 && console.log("SpiceMsgCursorHide");
        this.setCursorStyle("none");
        return true;
    }

    resetCursor() {
        DEBUG > 1 && console.log("SpiceMsgCursorReset");
        this.setCursorStyle("auto");
        return true;
    }

    setCursorStyle(style) {
        const screen = document.getElementById(this.parent.screen_id);
        screen.style.cursor = style;
    }

    set_cursor(cursor) {
        const { width, height, hot_spot_x, hot_spot_y } = cursor.header;
        const pngstr = create_rgba_png(width, height, cursor.data);
        const curstr = `url(data:image/png,${pngstr}) ${hot_spot_x} ${hot_spot_y}, default`;
        const screen = document.getElementById(this.parent.screen_id);

        screen.style.cursor = 'auto';
        screen.style.cursor = curstr;

        if (window.getComputedStyle(screen).cursor === 'auto') {
            SpiceSimulateCursor.simulate_cursor(this, cursor, screen, pngstr);
        }
    }

    set_cursor_mono(cursor) {
        const { width, height, hot_spot_x, hot_spot_y } = cursor.header;
        
        const monoData = new Uint8Array(cursor.data);
        const imageData = this.mono_image_to_data(monoData, width, height);

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.putImageData(imageData, 0, 0);

        const pngstr = canvas.toDataURL("image/png");

        const curstr = `url(${pngstr}) ${hot_spot_x} ${hot_spot_y}, auto`;

        const screen = document.getElementById(this.parent.screen_id);
        screen.style.cursor = curstr;

        if (window.getComputedStyle(screen).cursor === 'auto') {
            SpiceSimulateCursor.simulate_cursor(this, cursor, screen, pngstr);
        }
    }
}

export { SpiceCursorConn };
