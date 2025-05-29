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

const PNG_IHDR_SIZE = 25;
const PNG_IHDR_DATA_SIZE = 13;
const PNG_IHDR_CRC_SIZE = 17;

const rfc2083_crc_table = new Uint32Array(256).map((_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) {
        c = (c & 1) ? ((0xedb88320 ^ (c >>> 1)) >>> 0) : (c >>> 1);
    }
    return c;
});


function rfc2083_update_crc(crc, u8buf, at, len) {
    let c = crc >>> 0;
    const end = at + len;
    
    for (let offset = at; offset < end; offset++) {
        c = rfc2083_crc_table[(c ^ u8buf[offset]) & 0xFF] ^ (c >>> 8);
    }
    
    return c;
}


function rfc2083_crc(u8buf, at, len) {
    return (rfc2083_update_crc(0xFFFFFFFF, u8buf, at, len) ^ 0xFFFFFFFF) >>> 0;
}


function crc32(mb, at, len) {
    const u8 = mb instanceof Uint8Array ? mb : new Uint8Array(mb);
    return rfc2083_crc(u8, at, len);
}

class PngIHDR {
    constructor(width, height) {
        this.width = width;
        this.height = height;
        this.depth = 8;
        this.type = 6;
        this.compression = 0;
        this.filter = 0;
        this.interlace = 0;
    }

    to_buffer(a, at = 0) {
        const dv = new DataView(a);
        const orig = at;
        
        dv.setUint32(at, PNG_IHDR_DATA_SIZE); 
        at += 4;
        
        dv.setUint32(at, 0x49484452);
        at += 4;
        
        dv.setUint32(at, this.width); 
        at += 4;
        
        dv.setUint32(at, this.height); 
        at += 4;
        
        dv.setUint8(at, this.depth); 
        at++;
        
        dv.setUint8(at, this.type); 
        at++;
        
        dv.setUint8(at, this.compression); 
        at++;
        
        dv.setUint8(at, this.filter); 
        at++;
        
        dv.setUint8(at, this.interlace); 
        at++;
        
        dv.setUint32(at, crc32(a, orig + 4, PNG_IHDR_CRC_SIZE)); 
        at += 4;
        
        return at;
    }

    buffer_size() {
        return PNG_IHDR_SIZE;
    }
}

function adler() {
    this.s1 = 1;
    this.s2 = 0;
}

adler.prototype.update = function(b) {
    this.s1 = (this.s1 + b) % 65521 | 0;
    this.s2 = (this.s2 + this.s1) % 65521 | 0;
};
function PngIDAT(width, height, bytes) {
    this.data = bytes;
    this.width = width;
    this.height = height;
}

PngIDAT.prototype = {
    to_buffer: function(a, at = 0) {
        const dv = new DataView(a);
        const orig = at;
        
        dv.setUint32(at, this.buffer_size() - 12);
        at += 4;
        
        dv.setUint32(at, 0x49444154);
        at += 4;
        
        dv.setUint16(at, 0x7801);
        at += 2;
        
        dv.setUint8(at++, 0x80);
        
        const blockSize = this.data.byteLength + this.height;
        dv.setUint16(at, blockSize);
        at += 2;
        dv.setUint16(at, ~blockSize);
        at += 2;
        
        const u8 = new Uint8Array(this.data);
        let i = 0;
        const zsum = new adler();
        
        for (let y = 0; y < this.height && i < u8.byteLength; y++) {
            dv.setUint8(at++, 0);
            zsum.update(0);
            
            const rowStart = at;
            while (at - rowStart < this.width * 4 && i < u8.byteLength) {
                const value = u8[i];
                dv.setUint8(at++, value);
                zsum.update(value);
                i++;
            }
        }
        
        dv.setUint16(at, zsum.s2);
        at += 2;
        dv.setUint16(at, zsum.s1);
        at += 2;
        
        dv.setUint32(at, crc32(a, orig + 4, this.buffer_size() - 8));
        at += 4;
        
        return at;
    },
    
    buffer_size: function() {
        return 12 + this.data.byteLength + this.height + 4 + 2 + 1 + 2 + 2;
    }
};


function PngIEND() {}

PngIEND.prototype = {
    to_buffer: function(a, at = 0) {
        const dv = new DataView(a);
        const orig = at;
        
        dv.setUint32(at, this.buffer_size() - 12);
        at += 4;
        
        dv.setUint32(at, 0x49454E44);
        at += 4;
        
        dv.setUint32(at, crc32(a, orig + 4, this.buffer_size() - 8));
        at += 4;
        
        return at;
    },
    
    buffer_size: function() {
        return 12;
    }
};


function create_rgba_png(width, height, bytes) {
    const ihdr = new PngIHDR(width, height);
    const idat = new PngIDAT(width, height, bytes);
    const iend = new PngIEND();
    
    const totalSize = ihdr.buffer_size() + idat.buffer_size() + iend.buffer_size();
    const mb = new ArrayBuffer(totalSize);
    
    let at = ihdr.to_buffer(mb);
    at = idat.to_buffer(mb, at);
    at = iend.to_buffer(mb, at);
    
    const u8 = new Uint8Array(mb);
    const hexValues = new Array(256);
    for (let i = 0; i < 256; i++) {
        hexValues[i] = '%' + (i < 16 ? '0' : '') + i.toString(16);
    }
    
    const parts = new Array(at);
    for (let i = 0; i < at; i++) {
        parts[i] = hexValues[u8[i]];
    }
    
    return "%89PNG%0D%0A%1A%0A" + parts.join('');
}

export {
  create_rgba_png,
};
