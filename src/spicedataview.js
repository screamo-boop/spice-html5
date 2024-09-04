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
class SpiceDataView {
    constructor(buffer, byteOffset = 0, byteLength) {
      this.buffer = buffer;
      this.byteOffset = byteOffset;
      this.byteLength = byteLength;
  
      this.u8 = new Uint8Array(buffer, byteOffset, byteLength);
  
      this.dataView = {
        getUint16: (offset, littleEndian) => this._getUint16(offset, littleEndian),
        getUint32: (offset, littleEndian) => this._getUint32(offset, littleEndian),
        getUint64: (offset, littleEndian) => this._getUint64(offset, littleEndian),
        setUint16: (offset, value, littleEndian) => this._setUint16(offset, value, littleEndian),
        setUint32: (offset, value, littleEndian) => this._setUint32(offset, value, littleEndian),
        setUint64: (offset, value, littleEndian) => this._setUint64(offset, value, littleEndian),
      };
    }
  
    _getUint16(offset, littleEndian) {
      return littleEndian
        ? this.u8[offset] | (this.u8[offset + 1] << 8)
        : (this.u8[offset + 1] << 8) | this.u8[offset];
    }
  
    _getUint32(offset, littleEndian) {
      return littleEndian
        ? this.u8[offset] | (this.u8[offset + 1] << 8) | (this.u8[offset + 2] << 16) | (this.u8[offset + 3] << 24)
        : (this.u8[offset + 3] << 24) | (this.u8[offset + 2] << 16) | (this.u8[offset + 1] << 8) | this.u8[offset];
    }
  
    _getUint64(offset, littleEndian) {
      const low = this._getUint32(offset, littleEndian);
      const high = this._getUint32(offset + 4, littleEndian);
      return littleEndian ? BigInt(low) + (BigInt(high) << 32n) : (BigInt(low) << 32n) + BigInt(high);
    }
  
    _setUint16(offset, value, littleEndian) {
      if (littleEndian) {
        this.u8[offset] = value & 0xFF;
        this.u8[offset + 1] = (value >> 8) & 0xFF;
      } else {
        this.u8[offset + 1] = value & 0xFF;
        this.u8[offset] = (value >> 8) & 0xFF;
      }
    }
  
    _setUint32(offset, value, littleEndian) {
      if (littleEndian) {
        this.u8[offset] = value & 0xFF;
        this.u8[offset + 1] = (value >> 8) & 0xFF;
        this.u8[offset + 2] = (value >> 16) & 0xFF;
        this.u8[offset + 3] = (value >> 24) & 0xFF;
      } else {
        this.u8[offset + 3] = value & 0xFF;
        this.u8[offset + 2] = (value >> 8) & 0xFF;
        this.u8[offset + 1] = (value >> 16) & 0xFF;
        this.u8[offset] = (value >> 24) & 0xFF;
      }
    }
  
    _setUint64(offset, value, littleEndian) {
      const high = Number((BigInt(value) >> 32n) & 0xFFFFFFFFn);
      const low = Number(BigInt(value) & 0xFFFFFFFFn);
      if (littleEndian) {
        this._setUint32(offset, low, littleEndian);
        this._setUint32(offset + 4, high, littleEndian);
      } else {
        this._setUint32(offset, high, littleEndian);
        this._setUint32(offset + 4, low, littleEndian);
      }
    }
  
    getUint8(byteOffset) {
      return this.u8[byteOffset];
    }
  
    getUint16(byteOffset, littleEndian = false) {
      return this.dataView.getUint16(byteOffset, littleEndian);
    }
  
    getUint32(byteOffset, littleEndian = false) {
      return this.dataView.getUint32(byteOffset, littleEndian);
    }
  
    getUint64(byteOffset, littleEndian = false) {
      return this.dataView.getUint64(byteOffset, littleEndian);
    }
  
    setUint8(byteOffset, value) {
      this.u8[byteOffset] = value;
    }
  
    setUint16(byteOffset, value, littleEndian = false) {
      this.dataView.setUint16(byteOffset, value, littleEndian);
    }
  
    setUint32(byteOffset, value, littleEndian = false) {
      this.dataView.setUint32(byteOffset, value, littleEndian);
    }
  
    setUint64(byteOffset, value, littleEndian = false) {
      this.dataView.setUint64(byteOffset, value, littleEndian);
    }
  }



export {
  SpiceDataView,
};
