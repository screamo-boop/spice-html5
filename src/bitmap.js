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
    if (spice_bitmap.format !== Constants.SPICE_BITMAP_FMT_32BIT && spice_bitmap.format !== Constants.SPICE_BITMAP_FMT_RGBA) {
        return undefined;
    }

    const u8 = new Uint8Array(spice_bitmap.data);
    const { x: width, y: height, stride, flags, format } = spice_bitmap;
    const topDown = flags & Constants.SPICE_BITMAP_FLAGS_TOP_DOWN;
    const src_dec = topDown ? 0 : 2 * stride;
    let src_offset = topDown ? 0 : (height - 1) * stride;

    const ret = context.createImageData(width, height);
    const retData = ret.data;
    const imageSize = width * height;

    for (let offset = 0, rowIndex = 0; rowIndex < height; rowIndex++) {
        for (let colIndex = 0; colIndex < width; colIndex++, offset += 4, src_offset += 4) {
            retData[offset] = u8[src_offset + 2];
            retData[offset + 1] = u8[src_offset + 1];
            retData[offset + 2] = u8[src_offset];
            retData[offset + 3] = (format === Constants.SPICE_BITMAP_FMT_32BIT) ? 255 : u8[src_offset];
        }
        src_offset -= src_dec; // Adjust offset for next row
    }

    return ret;
}


export {
  convert_spice_bitmap_to_web,
};