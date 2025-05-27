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
**  bitmap.js
**      Handle SPICE_IMAGE_TYPE_BITMAP
**--------------------------------------------------------------------------*/

import { Constants } from './enums.js';

function convert_spice_bitmap_to_web(context, spice_bitmap) {
    if (spice_bitmap.format !== Constants.SPICE_BITMAP_FMT_32BIT && 
        spice_bitmap.format !== Constants.SPICE_BITMAP_FMT_RGBA) {
        return null;
    }

    const { x: width, y: height, stride, flags, format } = spice_bitmap;
    const topDown = (flags & Constants.SPICE_BITMAP_FLAGS_TOP_DOWN) !== 0;
    const pixelSize = 4;
    const ret = context.createImageData(width, height);
    const retData = ret.data;

    let u8;
    if (spice_bitmap.data instanceof ArrayBuffer || 
        (typeof spice_bitmap.data === 'string' && spice_bitmap.data.length > 0)) {
        if (typeof spice_bitmap.data === 'string') {
            u8 = new Uint8Array(spice_bitmap.data.length);
            for (let i = 0; i < spice_bitmap.data.length; i++) {
                u8[i] = spice_bitmap.data.charCodeAt(i);
            }
        } else {
            u8 = new Uint8Array(spice_bitmap.data);
        }
    } else {
        console.error("Incorrect data in SpiceBitmap", spice_bitmap);
        return null;
    }

    const rowIndices = topDown 
        ? [...Array(height).keys()] 
        : [...Array(height).keys()].reverse();

    for (let rowIndex = 0; rowIndex < height; rowIndex++) {
        const srcRow = rowIndices[rowIndex];
        const srcOffsetStart = srcRow * stride;
        
        for (let colIndex = 0; colIndex < width; colIndex++) {
            const srcOffset = srcOffsetStart + colIndex * pixelSize;
            const destOffset = (rowIndex * width + colIndex) * pixelSize;

            retData[destOffset]     = u8[srcOffset + 2];      // R
            retData[destOffset + 1] = u8[srcOffset + 1];      // G
            retData[destOffset + 2] = u8[srcOffset];          // B
            retData[destOffset + 3] = (format === Constants.SPICE_BITMAP_FMT_32BIT) 
                ? 255 
                : u8[srcOffset + 3];
        }
    }

    return ret;
}

export {
  convert_spice_bitmap_to_web,
};