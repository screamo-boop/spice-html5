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
        return undefined;
    }

    const topDown = (spice_bitmap.flags & Constants.SPICE_BITMAP_FLAGS_TOP_DOWN) !== 0;
    const stride = spice_bitmap.stride;
    const u8 = new Uint8Array(spice_bitmap.data);
    const { x: width, y: height } = spice_bitmap;

    let src_offset = topDown ? 0 : (height - 1) * stride;
    const src_dec = topDown ? 0 : 2 * stride;

    const ret = context.createImageData(width, height);
    const ret_data = ret.data;
    const format32Bit = spice_bitmap.format === Constants.SPICE_BITMAP_FMT_32BIT;

    for (let row = 0; row < height; row++) {
        let rowOffset = row * width * 4;
        for (let col = 0; col < width; col++) {
            const srcIdx = src_offset + col * 4;
            const dstIdx = rowOffset + col * 4;

            ret_data[dstIdx] = u8[srcIdx + 2];
            ret_data[dstIdx + 1] = u8[srcIdx + 1];
            ret_data[dstIdx + 2] = u8[srcIdx];
            ret_data[dstIdx + 3] = format32Bit ? 255 : u8[srcIdx + 3]; // Transparency handled based on format
        }
        src_offset -= src_dec; // Adjusted outside the nested loop
    }

    return ret;
}


export {
  convert_spice_bitmap_to_web,
};
