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

function SpiceWireReader(sc, callback) {
    this.sc = sc;
    this.callback = callback;
    this.needed = 0;
    this.size = 0;
    this.saved_msg_header = undefined;

    this.buffers = {
        buffersArray: [],
        currentIndex: 0,
        currentOffset: 0,
    };

    this.sc.ws.wire_reader = this;
    this.sc.ws.binaryType = "arraybuffer";
    this.sc.ws.addEventListener('message', wire_blob_catcher);
}

SpiceWireReader.prototype = {

    /*------------------------------------------------------------------------
    **  Process messages coming in from our WebSocket
    **----------------------------------------------------------------------*/
    inbound: function(mb) {
        if (this.needed == 0) {
            this.buffers.buffersArray.push(mb);
            this.size += mb.byteLength;
            return;
        }

        if ((this.buffers.buffersArray.length - this.buffers.currentIndex === 0) && mb.byteLength >= this.needed) {
            if (mb.byteLength > this.needed) {
                this.buffers.buffersArray.push(mb.slice(this.needed));
                this.size = mb.byteLength - this.needed;
            } else {
                this.size = 0;
            }
            const toProcess = mb.slice(0, this.needed);
            this.callback.call(this.sc, toProcess, this.saved_msg_header);
        } else {
            this.buffers.buffersArray.push(mb);
            this.size += mb.byteLength;
        }

        while (this.size >= this.needed) {
            let bytesToRead = this.needed;
            const frame = new Uint8Array(this.needed);
            let offset = 0;

            while (bytesToRead > 0 && this.buffers.currentIndex < this.buffers.buffersArray.length) {
                const currentBuffer = this.buffers.buffersArray[this.buffers.currentIndex];
                const currentView = new Uint8Array(currentBuffer);
                const bytesAvailable = currentView.length - this.buffers.currentOffset;
                const bytesToCopy = Math.min(bytesAvailable, bytesToRead);

                frame.set(currentView.subarray(this.buffers.currentOffset, this.buffers.currentOffset + bytesToCopy), offset);

                this.buffers.currentOffset += bytesToCopy;
                offset += bytesToCopy;
                bytesToRead -= bytesToCopy;
                this.size -= bytesToCopy;

                if (this.buffers.currentOffset >= currentView.length) {
                    // Move to next buffer
                    this.buffers.currentIndex++;
                    this.buffers.currentOffset = 0;
                }
            }

            this.callback.call(this.sc, frame.buffer, this.saved_msg_header || undefined);
        }

        // Cleanup buffers if all processed
        if (this.buffers.currentIndex >= this.buffers.buffersArray.length) {
            this.buffers.buffersArray = [];
            this.buffers.currentIndex = 0;
            this.buffers.currentOffset = 0;
        }
    },

    request: function(n) {
        this.needed = n;
    },

    save_header: function(h) {
        this.saved_msg_header = h;
    },

    clear_header: function() {
        this.saved_msg_header = undefined;
    },
}

function wire_blob_catcher(e) {
    DEBUG > 1 && console.log(">> WebSockets.onmessage");
    DEBUG > 1 && console.log("id " + this.wire_reader.sc.connection_id + "; type " + this.wire_reader.sc.type);
    SpiceWireReader.prototype.inbound.call(this.wire_reader, e.data);
}

export {
  SpiceWireReader,
};
