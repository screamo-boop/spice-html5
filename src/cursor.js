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

        if (cursor_set.cursor.header.type !== Constants.SPICE_CURSOR_TYPE_ALPHA) {
            this.log_warn(`FIXME: No support for cursor type ${cursor_set.cursor.header.type}`);
            return false;
        }

        this.set_cursor(cursor_set.cursor);
        return true;
    }
// FIXME: Temporary disabled cursor hide for oldest operating systems
    hideCursor() {
        DEBUG > 1 && console.log("SpiceMsgCursorHide");
        this.setCursorStyle("auto");
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
}

export { SpiceCursorConn };
