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

/*--------------------------------------------------------------------------------------
**  SpiceWireReader
**      This class will receive messages from a WebSocket and relay it to a given
**  callback.  It will optionally save and pass along a header, useful in processing
**  the mini message format.
**--------------------------------------------------------------------------------------*/

import { DEBUG } from './utils.js';
import { combine_array_buffers } from './utils.js';

function SpiceWireReader(sc, callback)
{
    this.sc = sc;
    this.callback = callback;
    this.needed = 0;
    this.size = 0;

    this.buffers = [];

    this.sc.ws.wire_reader = this;
    this.sc.ws.binaryType = "arraybuffer";
    this.sc.ws.addEventListener('message', wire_blob_catcher);
}

SpiceWireReader.prototype =
{

    /*------------------------------------------------------------------------
    **  Process messages coming in from our WebSocket
    **----------------------------------------------------------------------*/
    inbound: function (mb)
    {
        var at;

        /* Just buffer if we don't need anything yet */
        if (this.needed == 0)
        {
            this.buffers.push(mb);
            this.size += mb.byteLength;
            return;
        }

        /* Optimization - if we have just one inbound block, and it's
            suitable for our needs, just use it.  */
            if (this.buffers.length === 0 && mb.byteLength >= this.needed) {
                if (mb.byteLength > this.needed) {
                    // Since we're slicing mb when byteLength exceeds needed, slice directly
                    // without reallocating memory unnecessarily.
                    this.buffers.push(mb.slice(this.needed));
                    this.size = mb.byteLength - this.needed;
                }
                // Directly use the required slice of mb for the callback
                const toProcess = mb.slice(0, this.needed);
                this.callback.call(this.sc, toProcess, this.saved_msg_header);
            } else {
                // Push the complete buffer if conditions are not met for immediate processing
                this.buffers.push(mb);
                this.size += mb.byteLength;
            }


        /* Optimization - All it takes is one combine  */
        while (this.size >= this.needed) {
            let count = 0;
            const frame = new ArrayBuffer(this.needed);
            const view = new Uint8Array(frame);

            while (count < frame.byteLength && this.buffers.length > 0) {
                const buf = this.buffers.shift();
                const uint8 = new Uint8Array(buf);
                const step = frame.byteLength - count;

                if (uint8.length <= step) {
                    view.set(uint8, count);
                    count += uint8.length;
                    this.size -= uint8.length;
                } else {
                    view.set(uint8.slice(0, step), count);
                    this.buffers.unshift(uint8.slice(step));
                    count += step;
                    this.size -= step;
                }
            }

            this.callback.call(this.sc, frame, this.saved_msg_header || undefined);
        }

    },

    request: function(n)
    {
        this.needed = n;
    },

    save_header: function(h)
    {
        this.saved_msg_header = h;
    },

    clear_header: function()
    {
        this.saved_msg_header = undefined;
    },
}

function wire_blob_catcher(e)
{
    DEBUG > 1 && console.log(">> WebSockets.onmessage");
    DEBUG > 1 && console.log("id " + this.wire_reader.sc.connection_id +"; type " + this.wire_reader.sc.type);
    SpiceWireReader.prototype.inbound.call(this.wire_reader, e.data);
}

export {
  SpiceWireReader,
};
