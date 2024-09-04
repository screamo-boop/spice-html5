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
**  SpiceDataView
** FIXME FIXME
**    This is used because Firefox does not have DataView yet.
**    We should use DataView if we have it, because it *has* to
**    be faster than this code
**--------------------------------------------------------------------------*/
function SpiceDataView(buffer, byteOffset = 0, byteLength) {
    this.u8 = new Uint8Array(buffer, byteOffset, byteLength);
}

SpiceDataView.prototype = {
    getUint8: function (byteOffset) {
        return this.u8[byteOffset];
    },
    getUint16: function (byteOffset, littleEndian = false) {
        const b0 = this.u8[byteOffset];
        const b1 = this.u8[byteOffset + 1];
        return littleEndian ? (b1 << 8) | b0 : (b0 << 8) | b1;
    },
    getUint32: function (byteOffset, littleEndian = false) {
        const b0 = this.getUint16(byteOffset, littleEndian);
        const b1 = this.getUint16(byteOffset + 2, littleEndian);
        return littleEndian ? (b1 << 16) | b0 : (b0 << 16) | b1;
    },
    getUint64: function (byteOffset, littleEndian = false) {
        const b0 = this.getUint32(byteOffset, littleEndian);
        const b1 = this.getUint32(byteOffset + 4, littleEndian);
        return littleEndian ? BigInt((b1 << 32) | b0) : BigInt((b0 << 32) | b1);
    },
    setUint8: function (byteOffset, value) {
        this.u8[byteOffset] = value & 0xFF;
    },
    setUint16: function (byteOffset, value, littleEndian = false) {
        const b0 = (value >> 8) & 0xFF;
        const b1 = value & 0xFF;
        if (littleEndian) {
            this.u8[byteOffset] = b1;
            this.u8[byteOffset + 1] = b0;
        } else {
            this.u8[byteOffset] = b0;
            this.u8[byteOffset + 1] = b1;
        }
    },
    setUint32: function (byteOffset, value, littleEndian = false) {
        const b0 = (value >> 16) & 0xFFFF;
        const b1 = value & 0xFFFF;
        if (littleEndian) {
            this.setUint16(byteOffset, b1, littleEndian);
            this.setUint16(byteOffset + 2, b0, littleEndian);
        } else {
            this.setUint16(byteOffset, b0, littleEndian);
            this.setUint16(byteOffset + 2, b1, littleEndian);
        }
    },
    setUint64: function (byteOffset, value, littleEndian = false) {
        const b0 = Number((BigInt(value) >> BigInt(32)) & BigInt(0xFFFFFFFF));
        const b1 = Number(BigInt(value) & BigInt(0xFFFFFFFF));
        if (littleEndian) {
            this.setUint32(byteOffset, b1, littleEndian);
            this.setUint32(byteOffset + 4, b0, littleEndian);
        } else {
            this.setUint32(byteOffset, b0, littleEndian);
            this.setUint32(byteOffset + 4, b1, littleEndian);
        }
    },
};


export {
  SpiceDataView,
};
