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
**  crc logic from rfc2083 ported to Javascript
**--------------------------------------------------------------------------*/

var rfc2083_crc_table = new Uint32Array(256);
var rfc2083_crc_table_computed = false;

function rfc2083_make_crc_table() {
    if (rfc2083_crc_table_computed) return;

    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) {
            c = (c & 1) ? ((0xedb88320 ^ (c >>> 1)) >>> 0) : (c >>> 1);
        }
        rfc2083_crc_table[n] = c;
    }

    rfc2083_crc_table_computed = true;
}
/* Update a running CRC with the bytes buf[0..len-1]--the CRC
     should be initialized to all 1's, and the transmitted value
     is the 1's complement of the final running CRC (see the
     crc() routine below)). */

function rfc2083_update_crc(crc, u8buf, at, len) {
let c = crc;

if (!rfc2083_crc_table) {
    rfc2083_make_crc_table();
}

const table = rfc2083_crc_table;
for (let n = 0; n < len; n++) {
    c = table[(c ^ u8buf[at + n]) & 0xff] ^ (c >>> 8);
}

return c;
}

function rfc2083_crc(u8buf, at, len) {
    return rfc2083_update_crc(0xffffffff, u8buf, at, len) ^ 0xffffffff;
}

function crc32(mb, at, len) {
    let u8;
    if (mb instanceof Uint8Array) {
        u8 = mb;
    } else {
        u8 = new Uint8Array(mb);
    }
    return rfc2083_crc(u8, at, len);
}

function PngIHDR(width, height) {
    this.width = width;
    this.height = height;
    this.depth = 8;
    this.type = 6;
    this.compression = 0;
    this.filter = 0;
    this.interlace = 0;
}

PngIHDR.prototype = {
    to_buffer: function(a, at = 0) {
        const orig = at;
        const dv = new DataView(a, at, this.buffer_size());
        
        dv.setUint32(0, 13);
        dv.setUint32(4, 0x49484452, false);
        
        dv.setUint32(8, this.width);
        dv.setUint32(12, this.height);
        
        const fields = [
            this.depth,
            this.type,
            this.compression,
            this.filter,
            this.interlace
        ];
        
        fields.forEach((value, index) => dv.setUint8(16 + index, value));

        const crcOffset = 20;
        const crcLength = this.buffer_size() - 8;
        dv.setUint32(crcOffset, crc32(new Uint8Array(a, orig + 4, crcLength)), false);

        return at + this.buffer_size();
    },
    
    buffer_size: function() {
        return 25;
    }
};

function adler()
{
    this.s1 = 1;
    this.s2 = 0;
}

adler.prototype.update = function(b)
{
    this.s1 += b;
    this.s1 %= 65521;
    this.s2 += this.s1;
    this.s2 %= 65521;
}

function PngIDAT(width, height, bytes)
{
    if (bytes.byteLength > 65535)
    {
        throw new Error("Cannot handle more than 64K");
    }
    this.data = bytes;
    this.width = width;
    this.height = height;
}

PngIDAT.prototype = {
    to_buffer: function(a, at) {
        at = at || 0;
        const orig = at;
        let dv = new DataView(a);
        const zsum = new adler();
        
        dv.setUint32(at, this.buffer_size() - 12); at += 4;
        dv.setUint32(at, 0x49444154); at += 4;

        dv.setUint16(at, 0x7801); at += 2;

        const uncompressedSize = this.data.byteLength + this.height;
        dv.setUint8(at, 0x80); at++;
        dv.setUint16(at, uncompressedSize); at += 2;
        dv.setUint16(at, ~uncompressedSize); at += 2;

        const u8 = new Uint8Array(this.data);
        let i = 0;
        
        for (let y = 0; y < this.height; y++) {
            dv.setUint8(at++, 0);
            zsum.update(0);

            for (let x = 0; x < this.width && i < u8.length; x += 4) {
                for (let b = 0; b < 4; b++) {
                    const byte = u8[i++];
                    dv.setUint8(at++, byte);
                    zsum.update(byte);
                }
            }
        }

        dv.setUint16(at, zsum.s2); at += 2;
        dv.setUint16(at, zsum.s1); at += 2;
        dv.setUint32(at, crc32(a, orig + 4, this.buffer_size() - 8)); at += 4;
        return at;
    },
    buffer_size: function() {
        return 12 + this.data.byteLength + this.height + 4 + 2 + 1 + 2 + 2;
    }
}

function PngIEND()
{
}

PngIEND.prototype = {
    to_buffer: function(a, at = 0) {
        const orig = at;
        const dv = new DataView(a);
        const bufferSize = 12;
        const chunkLength = bufferSize - 12;
        
        const IEND = new Uint8Array([...'IEND'].map(c => c.charCodeAt(0)));

        dv.setUint32(at, chunkLength); at += 4;
        IEND.forEach(code => { dv.setUint8(at++, code); });
        dv.setUint32(at, crc32(a, orig + 4, bufferSize - 8)); at += 4;

        return at;
    },
    buffer_size: function() {
        return 12;
    }
}


function create_rgba_png(width, height, bytes) {
    var ihdr = new PngIHDR(width, height);
    var idat = new PngIDAT(width, height, bytes);
    var iend = new PngIEND();

    var bufferSize = ihdr.buffer_size() + idat.buffer_size() + iend.buffer_size();
    var mb = new ArrayBuffer(bufferSize);
    var at = ihdr.to_buffer(mb);
    at = idat.to_buffer(mb, at);
    at = iend.to_buffer(mb, at);

    var u8 = new Uint8Array(mb);
    var hex = '';
    var lookup = Array.from({length: 16}, (_, i) => i.toString(16).padStart(2, '0'));

    for (var i = 0; i < at; i++) {
        hex += `%${lookup[u8[i]]}`;
    }

    return "%89PNG%0D%0A%1A%0A" + hex;
}


export {
  create_rgba_png,
};
