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
**  Spice types
**      This file contains classes for common spice types.
**  Generally, they are used as helpers in reading and writing messages
**  to and from the server.
**--------------------------------------------------------------------------*/

import { Constants } from './enums.js';
import { SpiceQuic } from './quic.js';

function SpiceChannelId()
{
}
SpiceChannelId.prototype =
{
    from_dv: function(dv, at, mb)
    {
        this.type = dv.getUint8(at, true); at ++;
        this.id = dv.getUint8(at, true); at ++;
        return at;
    },
}

function SpiceRect()
{
}

SpiceRect.prototype =
{
    from_dv: function(dv, at, mb)
    {
        this.top = dv.getUint32(at, true); at += 4;
        this.left = dv.getUint32(at, true); at += 4;
        this.bottom = dv.getUint32(at, true); at += 4;
        this.right = dv.getUint32(at, true); at += 4;
        return at;
    },
    is_same_size : function(r)
    {
        if ((this.bottom - this.top) == (r.bottom - r.top) &&
            (this.right - this.left) == (r.right - r.left) )
            return true;

        return false;
    },
}

function SpiceClipRects()
{
}

SpiceClipRects.prototype =
{
    from_dv: function(dv, at, mb)
    {
        var i;
        this.num_rects = dv.getUint32(at, true); at += 4;
        if (this.num_rects > 0)
            this.rects = [];
        for (i = 0; i < this.num_rects; i++)
        {
            this.rects[i] = new SpiceRect();
            at = this.rects[i].from_dv(dv, at, mb);
        }
        return at;
    },
}

function SpiceClip()
{
}

SpiceClip.prototype =
{
    from_dv: function(dv, at, mb)
    {
        this.type = dv.getUint8(at, true); at ++;
        if (this.type == Constants.SPICE_CLIP_TYPE_RECTS)
        {
            this.rects = new SpiceClipRects();
            at = this.rects.from_dv(dv, at, mb);
        }
        return at;
    },
}

function SpiceImageDescriptor()
{
}

SpiceImageDescriptor.prototype =
{
    from_dv: function(dv, at, mb)
    {
        this.id = dv.getUint64(at, true); at += 8;
        this.type  = dv.getUint8(at, true); at ++;
        this.flags = dv.getUint8(at, true); at ++;
        this.width = dv.getUint32(at, true); at += 4;
        this.height= dv.getUint32(at, true); at += 4;
        return at;
    },
}

function SpicePalette()
{
}

SpicePalette.prototype =
{
    from_dv: function(dv, at, mb)
    {
        var i;
        this.unique = dv.getUint64(at, true); at += 8;
        this.num_ents = dv.getUint16(at, true); at += 2;
        this.ents = [];
        for (i = 0; i < this.num_ents; i++)
        {
            this.ents[i] = dv.getUint32(at, true); at += 4;
        }
        return at;
    },
}

function SpiceBitmap()
{
}

SpiceBitmap.prototype = {
    from_dv: function(dv, at, mb) {
        this.format = dv.getUint8(at++, true);
        this.flags = dv.getUint8(at++, true);
        this.x = dv.getUint32(at, true); at += 4;
        this.y = dv.getUint32(at, true); at += 4;
        this.stride = dv.getUint32(at, true); at += 4;

        let dataStart = at;
        if (this.flags & Constants.SPICE_BITMAP_FLAGS_PAL_FROM_CACHE) {
            this.palette_id = dv.getUint64(at, true);
            at += 8;
        } else {
            const paletteOffset = dv.getUint32(at, true);
            at += 4;
            if (paletteOffset) {
                this.palette = new SpicePalette();
                this.palette.from_dv(dv, paletteOffset, mb);
                dataStart = at;
                const dataEnd = paletteOffset;
                this.data = mb.slice(dataStart, dataEnd);
                at += dataEnd - dataStart;
                return at;
            }
        }

        this.data = mb.slice(dataStart);
        at += this.data.byteLength;
        return at;
    },
};

function SpiceImage()
{
}

SpiceImage.prototype = {
    from_dv: function(dv, at, mb) {
        this.descriptor = new SpiceImageDescriptor();
        at = this.descriptor.from_dv(dv, at, mb);

        const type = this.descriptor.type;
        
        if (type === Constants.SPICE_IMAGE_TYPE_LZ_RGB) {
            this._parseLZRGB(dv, at, mb);
            at = this.lz_rgb.data.byteLength + this.lz_rgb._end;
        } 
        else if (type === Constants.SPICE_IMAGE_TYPE_BITMAP) {
            this.bitmap = new SpiceBitmap();
            at = this.bitmap.from_dv(dv, at, mb);
        } 
        else if (type === Constants.SPICE_IMAGE_TYPE_SURFACE) {
            this.surface_id = dv.getUint32(at, true);
            at += 4;
        } 
        else if (type === Constants.SPICE_IMAGE_TYPE_JPEG) {
            this._parseJPEG(dv, at, mb);
            at += this.jpeg.data.byteLength + 4;
        } 
        else if (type === Constants.SPICE_IMAGE_TYPE_JPEG_ALPHA) {
            at = this._parseJPEGAlpha(dv, at, mb);
        } 
        else if (type === Constants.SPICE_IMAGE_TYPE_QUIC) {
            this.quic = new SpiceQuic();
            at = this.quic.from_dv(dv, at, mb);
        }

        return at;
    },

    _parseLZHeader(dv, at, target) {
        const start = at;
        target.magic = String.fromCharCode(...[3,2,1,0].map(i => dv.getUint8(at + i)));
        at += 4;
        
        const view = new DataView(dv.buffer);
        target.version = view.getUint32(at, false);  // Big-endian
        target.type = view.getUint32(at += 4, false);
        target.width = view.getUint32(at += 4, false);
        target.height = view.getUint32(at += 4, false);
        target.stride = view.getUint32(at += 4, false);
        target.top_down = view.getUint32(at += 4, false);
        at += 4;

        return { header_size: at - start, new_at: at };
    },

    _parseLZRGB(dv, at, mb) {
        this.lz_rgb = { length: dv.getUint32(at, true) };
        let res = this._parseLZHeader(dv, at += 4, this.lz_rgb);
        
        this.lz_rgb.data = mb.slice(res.new_at, this.lz_rgb.length + res.new_at - res.header_size);
        this.lz_rgb._end = res.new_at + this.lz_rgb.data.byteLength;
    },

    _parseJPEG(dv, at, mb) {
        this.jpeg = {
            data_size: dv.getUint32(at, true),
            data: mb.slice(at += 4, at + dv.getUint32(at, true))
        };
    },

    _parseJPEGAlpha(dv, at, mb) {
        this.jpeg_alpha = {
            flags: dv.getUint8(at, true),
            jpeg_size: dv.getUint32(at += 1, true),
            data_size: dv.getUint32(at += 4, true),
        };
        
        this.jpeg_alpha.data = mb.slice(at += 4, at + this.jpeg_alpha.jpeg_size);
        at += this.jpeg_alpha.jpeg_size;

        // Parse alpha channel
        this.jpeg_alpha.alpha = { length: this.jpeg_alpha.data_size - this.jpeg_alpha.jpeg_size };
        let res = this._parseLZHeader(dv, at, this.jpeg_alpha.alpha);
        
        this.jpeg_alpha.alpha.data = mb.slice(
            res.new_at, 
            this.jpeg_alpha.alpha.length + res.new_at - res.header_size
        );
        
        return res.new_at + this.jpeg_alpha.alpha.data.byteLength;
    },
};

function SpiceQMask()
{
}

SpiceQMask.prototype =
{
    from_dv: function(dv, at, mb)
    {
        this.flags  = dv.getUint8(at, true); at++;
        this.pos = new SpicePoint;
        at = this.pos.from_dv(dv, at, mb);
        var offset = dv.getUint32(at, true); at += 4;
        if (offset == 0)
        {
            this.bitmap = null;
            return at;
        }

        this.bitmap = new SpiceImage;
        return this.bitmap.from_dv(dv, offset, mb);
    },
}


function SpicePattern()
{
}

SpicePattern.prototype =
{
    from_dv: function(dv, at, mb)
    {
        var offset = dv.getUint32(at, true); at += 4;
        if (offset == 0)
        {
            this.pat = null;
        }
        else
        {
            this.pat = new SpiceImage;
            this.pat.from_dv(dv, offset, mb);
        }

        this.pos = new SpicePoint;
        return this.pos.from_dv(dv, at, mb);
    }
}

function SpiceBrush()
{
}

SpiceBrush.prototype =
{
    from_dv: function(dv, at, mb)
    {
        this.type = dv.getUint8(at, true); at ++;
        if (this.type == Constants.SPICE_BRUSH_TYPE_SOLID)
        {
            this.color = dv.getUint32(at, true); at += 4;
        }
        else if (this.type == Constants.SPICE_BRUSH_TYPE_PATTERN)
        {
            this.pattern = new SpicePattern;
            at = this.pattern.from_dv(dv, at, mb);
        }
        return at;
    },
}

function SpiceFill()
{
}

SpiceFill.prototype =
{
    from_dv: function(dv, at, mb)
    {
        this.brush = new SpiceBrush;
        at = this.brush.from_dv(dv, at, mb);
        this.rop_descriptor = dv.getUint16(at, true); at += 2;
        this.mask = new SpiceQMask;
        return this.mask.from_dv(dv, at, mb);
    },
}


function SpiceCopy()
{
}

SpiceCopy.prototype =
{
    from_dv: function(dv, at, mb)
    {
        var offset = dv.getUint32(at, true); at += 4;
        if (offset == 0)
        {
            this.src_bitmap = null;
        }
        else
        {
            this.src_bitmap = new SpiceImage;
            this.src_bitmap.from_dv(dv, offset, mb);
        }
        this.src_area = new SpiceRect;
        at = this.src_area.from_dv(dv, at, mb);
        this.rop_descriptor = dv.getUint16(at, true); at += 2;
        this.scale_mode = dv.getUint8(at, true); at ++;
        this.mask = new SpiceQMask;
        return this.mask.from_dv(dv, at, mb);
    },
}

function SpicePoint16()
{
}

SpicePoint16.prototype =
{
    from_dv: function(dv, at, mb)
    {
        this.x = dv.getUint16(at, true); at += 2;
        this.y = dv.getUint16(at, true); at += 2;
        return at;
    },
}

function SpicePoint()
{
}

SpicePoint.prototype =
{
    from_dv: function(dv, at, mb)
    {
        this.x = dv.getUint32(at, true); at += 4;
        this.y = dv.getUint32(at, true); at += 4;
        return at;
    },
}

function SpiceCursorHeader()
{
}

SpiceCursorHeader.prototype =
{
    from_dv: function(dv, at, mb)
    {
        this.unique = dv.getUint64(at, true); at += 8;
        this.type = dv.getUint8(at, true); at ++;
        this.width = dv.getUint16(at, true); at += 2;
        this.height = dv.getUint16(at, true); at += 2;
        this.hot_spot_x = dv.getUint16(at, true); at += 2;
        this.hot_spot_y = dv.getUint16(at, true); at += 2;
        return at;
    },
}

function SpiceCursor()
{
}

SpiceCursor.prototype =
{
    from_dv: function(dv, at, mb)
    {
        this.flags = dv.getUint16(at, true); at += 2;
        if (this.flags & Constants.SPICE_CURSOR_FLAGS_NONE)
            this.header = null;
        else
        {
            this.header = new SpiceCursorHeader;
            at = this.header.from_dv(dv, at, mb);
            this.data   = mb.slice(at);
            at += this.data.byteLength;
        }
        return at;
    },
}

function SpiceSurface()
{
}

SpiceSurface.prototype =
{
    from_dv: function(dv, at, mb)
    {
        this.surface_id = dv.getUint32(at, true); at += 4;
        this.width = dv.getUint32(at, true); at += 4;
        this.height = dv.getUint32(at, true); at += 4;
        this.format = dv.getUint32(at, true); at += 4;
        this.flags = dv.getUint32(at, true); at += 4;
        return at;
    },
}

/* FIXME - SpiceImage  types lz_plt, jpeg, zlib_glz, and jpeg_alpha are
           completely unimplemented */

export {
  SpiceChannelId,
  SpiceRect,
  SpiceClipRects,
  SpiceClip,
  SpiceImageDescriptor,
  SpicePalette,
  SpiceBitmap,
  SpiceImage,
  SpiceQMask,
  SpicePattern,
  SpiceBrush,
  SpiceFill,
  SpiceCopy,
  SpicePoint16,
  SpicePoint,
  SpiceCursorHeader,
  SpiceCursor,
  SpiceSurface,
};
