"use strict";
/*
   Copyright (C) 2013 by Jeremy P. White <jwhite@codeweavers.com>

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
**  SpiceSimulateCursor
**      Internet Explorer 10 does not support data uri's in cursor assignment.
**  This file provides a number of gimmicks to compensate.  First, if there
**  is a preloaded cursor available, we will use that.  Failing that, we will
**  simulate a cursor using an image that is moved around the screen.
**--------------------------------------------------------------------------*/

import { hex_sha1 } from './thirdparty/sha1.js';

var SpiceSimulateCursor = {

cursors : new Array(),
unknown_cursors : new Array(),
warned: false,

add_cursor: function(sha1, value)
{
    SpiceSimulateCursor.cursors[sha1] = value;
},

unknown_cursor: function(sha1, curdata)
{
    if (! SpiceSimulateCursor.warned)
    {
        SpiceSimulateCursor.warned = true;
        alert("Internet Explorer does not support dynamic cursors.  " +
              "This page will now simulate cursors with images, " +
              "which will be imperfect.  We recommend using Chrome or Firefox instead.  " +
              "\n\nIf you need to use Internet Explorer, you can create a static cursor " +
              "file for each cursor your application uses.  " +
              "View the console log for more information on creating static cursors for your environment.");
    }

    if (! SpiceSimulateCursor.unknown_cursors[sha1])
    {
        SpiceSimulateCursor.unknown_cursors[sha1] = curdata;
        console.log('Unknown cursor.  Simulation required.  To avoid simulation for this cursor, create and include a custom javascript file, and add the following line:');
        console.log('SpiceCursorSimulator.add_cursor("' + sha1 + '"), "<your filename here>.cur");');
        console.log('And then run following command, redirecting output into <your filename here>.cur:');
        console.log('php -r "echo urldecode(\'' + curdata + '\');"');
    }
},

simulate_cursor: function (spicecursor, cursor, screen, pngstr) {
    const cursor_sha = hex_sha1(`${pngstr} ${cursor.header.hot_spot_x} ${cursor.header.hot_spot_y}`);

    if (SpiceSimulateCursor.cursors && SpiceSimulateCursor.cursors[cursor_sha]) {
        screen.style.cursor = `url(${SpiceSimulateCursor.cursors[cursor_sha]}), default`;
    } else if (window.getComputedStyle(screen, null).cursor === 'auto') {
        SpiceSimulateCursor.unknown_cursor(cursor_sha,
            SpiceSimulateCursor.create_icondir(cursor.header.width, cursor.header.height,
            cursor.data.byteLength, cursor.header.hot_spot_x, cursor.header.hot_spot_y) + pngstr);

        document.getElementById(spicecursor.parent.screen_id).style.cursor = 'none';

        if (!spicecursor.spice_simulated_cursor) {
            const simulatedCursor = document.createElement('img');
            simulatedCursor.style.position = 'absolute';
            simulatedCursor.style.display = 'none';
            simulatedCursor.style.overflow = 'hidden';
            simulatedCursor.spice_screen = document.getElementById(spicecursor.parent.screen_id);

            simulatedCursor.addEventListener('mousemove', SpiceSimulateCursor.handle_sim_mousemove);

            simulatedCursor.spice_screen.appendChild(simulatedCursor);
            spicecursor.spice_simulated_cursor = simulatedCursor;
        }

        spicecursor.spice_simulated_cursor.src = `data:image/png,${pngstr}`;
        spicecursor.spice_simulated_cursor.spice_hot_x = cursor.header.hot_spot_x;
        spicecursor.spice_simulated_cursor.spice_hot_y = cursor.header.hot_spot_y;
        spicecursor.spice_simulated_cursor.style.pointerEvents = 'none';
    } else if (spicecursor.spice_simulated_cursor) {
        spicecursor.spice_simulated_cursor.spice_screen.removeChild(spicecursor.spice_simulated_cursor);
        delete spicecursor.spice_simulated_cursor;
    }
},


handle_sim_mousemove: function (e) {
    const duplicatedEvent = SpiceSimulateCursor.duplicate_mouse_event(e, this.spice_screen);
    return this.spice_screen.dispatchEvent(duplicatedEvent);
},

duplicate_mouse_event: function (e, target) {
    const eventOptions = {
        bubbles: true,
        cancelable: true,
        view: e.view,
        detail: e.detail,
        screenX: e.screenX,
        screenY: e.screenY,
        clientX: e.clientX,
        clientY: e.clientY,
        ctrlKey: e.ctrlKey,
        altKey: e.altKey,
        shiftKey: e.shiftKey,
        metaKey: e.metaKey,
        button: e.button,
        relatedTarget: e.relatedTarget
    };

    return new MouseEvent(e.type, eventOptions);
},


ICONDIR: function ()
{
},

ICONDIRENTRY: function(width, height, bytes, hot_x, hot_y)
{
    this.width = width;
    this.height = height;
    this.bytes = bytes;
    this.hot_x = hot_x;
    this.hot_y = hot_y;
},


create_icondir: function (width, height, bytes, hot_x, hot_y) {
    const header = new SpiceSimulateCursor.ICONDIR();
    const entry = new SpiceSimulateCursor.ICONDIRENTRY(width, height, bytes, hot_x, hot_y);

    const mb = new ArrayBuffer(header.buffer_size() + entry.buffer_size());
    let at = header.to_buffer(mb);
    at = entry.to_buffer(mb, at);

    const u8 = new Uint8Array(mb);
    const hexArray = [...u8].slice(0, at).map(byte => `%${byte.toString(16).padStart(2, '0')}`);

    return hexArray.join('');
},

};

SpiceSimulateCursor.ICONDIR.prototype = {
    to_buffer: function (a, at = 0) {
        const dv = new DataView(a);
        dv.setUint16(at, 0, true); at += 2;
        dv.setUint16(at, 2, true); at += 2;
        dv.setUint16(at, 1, true); at += 2;
        return at;
    },
    buffer_size: function () {
        return 6;
    }
};

SpiceSimulateCursor.ICONDIRENTRY.prototype = {
    to_buffer: function (a, at = 0) {
        const dv = new DataView(a);
        dv.setUint8(at++, this.width);
        dv.setUint8(at++, this.height);
        dv.setUint8(at++, 0);  // color palette count, unused
        dv.setUint8(at++, 0);  // reserved
        dv.setUint16(at, this.hot_x, true); at += 2;
        dv.setUint16(at, this.hot_y, true); at += 2;
        dv.setUint32(at, this.bytes, true); at += 4;
        dv.setUint32(at, at + 4, true); at += 4;  // Offset to bytes
        return at;
    },
    buffer_size: function () {
        return 16;
    }
};

export { SpiceSimulateCursor };
