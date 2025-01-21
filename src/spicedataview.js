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
"use strict";

class SpiceDataView {
    constructor(buffer, byteOffset = 0, byteLength) {
        this.buffer = buffer;
        this.byteOffset = byteOffset;
        this.byteLength = byteLength ?? buffer.byteLength - byteOffset;
        this.nativeView = new DataView(buffer, byteOffset, byteLength);
        this.u8 = new Uint8Array(buffer, byteOffset, byteLength);
    }
    _useNative(method, offset, littleEndian, bytes) {
        if (offset + bytes <= this.byteLength) {
            return this.nativeView[method](offset, littleEndian);
        }
        return null;
    }

    getUint8(byteOffset) {
        return this.u8[byteOffset];
    }

    getUint16(byteOffset, littleEndian = false) {
        return this._useNative('getUint16', byteOffset, littleEndian, 2) ??
            (littleEndian ?
                this.u8[byteOffset] | (this.u8[byteOffset + 1] << 8) :
                (this.u8[byteOffset] << 8) | this.u8[byteOffset + 1]);
    }

    getUint32(byteOffset, littleEndian = false) {
        return this._useNative('getUint32', byteOffset, littleEndian, 4) ??
            (littleEndian ?
                this.u8[byteOffset] | (this.u8[byteOffset + 1] << 8) |
                (this.u8[byteOffset + 2] << 16) | (this.u8[byteOffset + 3] << 24) :
                (this.u8[byteOffset] << 24) | (this.u8[byteOffset + 1] << 16) |
                (this.u8[byteOffset + 2] << 8) | this.u8[byteOffset + 3]);
    }

    getUint64(byteOffset, littleEndian = false) {
        const low = this.getUint32(byteOffset + (littleEndian ? 0 : 4), littleEndian);
        const high = this.getUint32(byteOffset + (littleEndian ? 4 : 0), littleEndian);
        return (BigInt(high) << 32n) | BigInt(low);
    }

    setUint8(byteOffset, value) {
        this.u8[byteOffset] = value;
    }

    setUint16(byteOffset, value, littleEndian = false) {
        try {
            this.nativeView.setUint16(byteOffset, value, littleEndian);
        } catch {
            if (littleEndian) {
                this.u8[byteOffset] = value & 0xFF;
                this.u8[byteOffset + 1] = (value >> 8) & 0xFF;
            } else {
                this.u8[byteOffset + 1] = value & 0xFF;
                this.u8[byteOffset] = (value >> 8) & 0xFF;
            }
        }
    }

    setUint32(byteOffset, value, littleEndian = false) {
        try {
            this.nativeView.setUint32(byteOffset, value, littleEndian);
        } catch {
            if (littleEndian) {
                for (let i = 0; i < 4; i++) {
                    this.u8[byteOffset + i] = (value >> (i * 8)) & 0xFF;
                }
            } else {
                for (let i = 0; i < 4; i++) {
                    this.u8[byteOffset + 3 - i] = (value >> (i * 8)) & 0xFF;
                }
            }
        }
    }

    setUint64(byteOffset, value, littleEndian = false) {
      const bigValue = BigInt(value);
      const high = bigValue >> 32n;
      const low = bigValue & 0xFFFFFFFFn;
      
      if (littleEndian) {
          this.setUint32(byteOffset, Number(low), true);
          this.setUint32(byteOffset + 4, Number(high), true);
      } else {
          this.setUint32(byteOffset, Number(high), false);
          this.setUint32(byteOffset + 4, Number(low), false);
      }
  }
}

export { SpiceDataView };
