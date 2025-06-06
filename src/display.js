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

import * as Webm from './webm.js';
import * as Messages from './spicemsg.js';
import * as Quic from './quic.js';
import * as Utils from './utils.js';
import * as Inputs from './inputs.js';
import { Constants } from './enums.js';
import { SpiceConn } from './spiceconn.js';
import { SpiceRect } from './spicetype.js';
import { convert_spice_lz_to_web } from './lz.js';
import { convert_spice_bitmap_to_web } from './bitmap.js';

const offscreen = new OffscreenCanvas(1, 1);
const offCtx = offscreen.getContext('2d');
offCtx.imageSmoothingEnabled = true;


function putImageDataWithAlpha(context, imageData, x, y) {
    offscreen.width = imageData.width;
    offscreen.height = imageData.height;
    offCtx.clearRect(0, 0, imageData.width, imageData.height);
    offCtx.putImageData(imageData, 0, 0);
    context.drawImage(offscreen, x, y, imageData.width, imageData.height);
}

function stripAlpha(imageData) {
    const data = imageData.data;
    const length = data.length;

    for (let i = 3; i < length; i += 4) {
        data[i] = 255;
    }
}

/*----------------------------------------------------------------------------
**  SpiceDisplayConn
**      Drive the Spice Display Channel
**--------------------------------------------------------------------------*/
function SpiceDisplayConn()
{
    this.debugWindow = null;
    this.debugContainer = null;
    SpiceConn.apply(this, arguments);
    this.palettes = {}
}

SpiceDisplayConn.prototype = Object.create(SpiceConn.prototype);
SpiceDisplayConn.prototype.process_channel_message = function(msg)
{
    if ([Constants.SPICE_MSG_DISPLAY_MODE, Constants.SPICE_MSG_DISPLAY_MARK].includes(msg.type)) {
        return true;
    }

    if (msg.type === Constants.SPICE_MSG_DISPLAY_RESET) {
        Utils.DEBUG > 2 && console.log("Display reset");
        this.surfaces[this.primary_surface]?.canvas.context.restore();
        console.log("display reset")
        return true;
    }
 //   console.log(msg.type)
    if (msg.type == Constants.SPICE_MSG_DISPLAY_DRAW_COPY)
    {
        var draw_copy = new Messages.SpiceMsgDisplayDrawCopy(msg.data);

        Utils.DEBUG > 1 && this.log_draw("DrawCopy", draw_copy);

        if (! draw_copy.base.box.is_same_size(draw_copy.data.src_area))
            this.log_warn("FIXME: DrawCopy src_area is a different size than base.box; we do not handle that yet.");
        if (draw_copy.data.rop_descriptor != Constants.SPICE_ROPD_OP_PUT)
            this.log_warn("FIXME: DrawCopy we don't handle ropd type: " + draw_copy.data.rop_descriptor);
        if (draw_copy.data.mask.flags)
            this.log_warn("FIXME: DrawCopy we don't handle mask flag: " + draw_copy.data.mask.flags);
        if (draw_copy.data.mask.bitmap)
            this.log_warn("FIXME: DrawCopy we don't handle mask");
        if (draw_copy.data && draw_copy.data.src_bitmap)
        {
            if (draw_copy.data.src_bitmap.descriptor.flags &&
                draw_copy.data.src_bitmap.descriptor.flags != Constants.SPICE_IMAGE_FLAGS_CACHE_ME &&
                draw_copy.data.src_bitmap.descriptor.flags != Constants.SPICE_IMAGE_FLAGS_HIGH_BITS_SET)
            {
                this.log_warn("FIXME: DrawCopy unhandled image flags: " + draw_copy.data.src_bitmap.descriptor.flags);
                Utils.DEBUG <= 1 && this.log_draw("DrawCopy", draw_copy);
            }

            if (draw_copy.data.src_bitmap.descriptor.type === Constants.SPICE_IMAGE_TYPE_QUIC) {
                const surfaceId = draw_copy.base.surface_id;
                const canvas = this.surfaces[surfaceId]?.canvas;
                
                if (!canvas || !draw_copy.data.src_bitmap.quic) {
                    this.log_warn("Unable to handle QUIC image");
                    return false;
                }

                const descriptor = draw_copy.data.src_bitmap.descriptor;
                if (this.cache && this.cache[descriptor.id]) {
                    return this.draw_copy_helper({
                        base: draw_copy.base,
                        src_area: draw_copy.data.src_area,
                        image_data: this.cache[descriptor.id],
                        tag: `copyquic.cache.${descriptor.id}`,
                        has_alpha: descriptor.type === Quic.Constants.QUIC_IMAGE_TYPE_RGBA,
                        descriptor
                    });
                }

                const source_img = Quic.convert_spice_quic_to_web(canvas.context, draw_copy.data.src_bitmap.quic);
                if (!source_img) {
                    this.log_warn(`Не удалось преобразовать QUIC изображение: ${draw_copy.data.src_bitmap.quic.type}`);
                    return false;
                }

                if (descriptor.flags & Constants.SPICE_IMAGE_FLAGS_CACHE_ME) {
                    this.cache = this.cache || {};
                    this.cache[descriptor.id] = source_img;
                }

                return this.draw_copy_helper({
                    base: draw_copy.base,
                    src_area: draw_copy.data.src_area,
                    image_data: source_img,
                    tag: `copyquic.${draw_copy.data.src_bitmap.quic.type}`,
                    has_alpha: draw_copy.data.src_bitmap.quic.type === Quic.Constants.QUIC_IMAGE_TYPE_RGBA,
                    descriptor
                });
            }
            else if (draw_copy.data.src_bitmap.descriptor.type == Constants.SPICE_IMAGE_TYPE_FROM_CACHE ||
                    draw_copy.data.src_bitmap.descriptor.type == Constants.SPICE_IMAGE_TYPE_FROM_CACHE_LOSSLESS)
            {
                if (! this.cache || ! this.cache[draw_copy.data.src_bitmap.descriptor.id])
                {
                    this.log_warn("FIXME: DrawCopy did not find image id " + draw_copy.data.src_bitmap.descriptor.id + " in cache.");
                    return false;
                }

                return this.draw_copy_helper(
                    { base: draw_copy.base,
                      src_area: draw_copy.data.src_area,
                      image_data: this.cache[draw_copy.data.src_bitmap.descriptor.id],
                      tag: "copycache." + draw_copy.data.src_bitmap.descriptor.id,
                      has_alpha: true, /* FIXME - may want this to be false... */
                      descriptor : draw_copy.data.src_bitmap.descriptor
                    });

                /* FIXME - LOSSLESS CACHE ramifications not understood or handled */
            }
            else if (draw_copy.data.src_bitmap.descriptor.type == Constants.SPICE_IMAGE_TYPE_SURFACE)
            {
                var source_context = this.surfaces[draw_copy.data.src_bitmap.surface_id].canvas.context;
                var target_context = this.surfaces[draw_copy.base.surface_id].canvas.context;

                var source_img = source_context.getImageData(
                        draw_copy.data.src_area.left, draw_copy.data.src_area.top,
                        draw_copy.data.src_area.right - draw_copy.data.src_area.left,
                        draw_copy.data.src_area.bottom - draw_copy.data.src_area.top);
                var computed_src_area = new SpiceRect;
                computed_src_area.top = computed_src_area.left = 0;
                computed_src_area.right = source_img.width;
                computed_src_area.bottom = source_img.height;

                /* FIXME - there is a potential optimization here.
                           That is, if the surface is from 0,0, and
                           both surfaces are alpha surfaces, you should
                           be able to just do a drawImage, which should
                           save time.  */
                
                return this.draw_copy_helper(
                    { base: draw_copy.base,
                      src_area: computed_src_area,
                      image_data: source_img,
                      tag: "copysurf." + draw_copy.data.src_bitmap.surface_id,
                      has_alpha: this.surfaces[draw_copy.data.src_bitmap.surface_id].format == Constants.SPICE_SURFACE_FMT_32_xRGB ? false : true,
                      descriptor : draw_copy.data.src_bitmap.descriptor
                    });
            }
            else if (draw_copy.data.src_bitmap.descriptor.type === Constants.SPICE_IMAGE_TYPE_JPEG) {
                const jpegData = draw_copy.data.src_bitmap.jpeg?.data;
                if (!jpegData) {
                    this.log_warn("Error handling JPEG: no data");
                    return false;
                }

                const blob = new Blob([new Uint8Array(jpegData)], { type: 'image/jpeg' });
                const imageUrl = URL.createObjectURL(blob);

                const img = new Image();
                img.o = {
                    base: draw_copy.base,
                    tag: `jpeg.${draw_copy.data.src_bitmap.surface_id}`,
                    descriptor: draw_copy.data.src_bitmap.descriptor,
                    sc: this
                };

                img.onload = () => {
                    handle_draw_jpeg_onload.call(img);
                    URL.revokeObjectURL(imageUrl);
                };

                img.onerror = () => {
                    this.log_err("Ошибка загрузки JPEG");
                    URL.revokeObjectURL(imageUrl);
                };

                img.src = imageUrl;
                return true;
            }
            else if (draw_copy.data.src_bitmap.descriptor.type === Constants.SPICE_IMAGE_TYPE_JPEG_ALPHA) {
            if (!draw_copy.data.src_bitmap.jpeg_alpha) {
                this.log_warn("Unable to handle JPEG_ALPHA image");
                return false;
            }

            const jpegData = new Uint8Array(draw_copy.data.src_bitmap.jpeg_alpha.data);
            const blob = new Blob([jpegData], { type: 'image/jpeg' });
            const imageUrl = URL.createObjectURL(blob);

            const img = new Image();
            img.o = {
                base: draw_copy.base,
                tag: `jpeg.${draw_copy.data.src_bitmap.surface_id}`,
                descriptor: draw_copy.data.src_bitmap.descriptor,
                sc: this
            };

            if (this.surfaces[draw_copy.base.surface_id]?.format === Constants.SPICE_SURFACE_FMT_32_ARGB) {
                const canvas = this.surfaces[draw_copy.base.surface_id].canvas;
                img.alpha_img = convert_spice_lz_to_web(canvas.context, draw_copy.data.src_bitmap.jpeg_alpha.alpha);
            }

            img.onload = () => {
                 handle_draw_jpeg_onload.call(img);
                 URL.revokeObjectURL(img.src);
            };
            img.src = imageUrl;

            return true;
                }

        else if (draw_copy.data.src_bitmap.descriptor.type === Constants.SPICE_IMAGE_TYPE_BITMAP) {
            const surfaceId = draw_copy.base.surface_id;
            const canvas = this.surfaces[surfaceId]?.canvas;
            
            if (!canvas || !draw_copy.data.src_bitmap.bitmap) {
                this.log_err("Bitmap not found");
                return false;
            }

            const source_img = convert_spice_bitmap_to_web(canvas.context, draw_copy.data.src_bitmap.bitmap);
            
            if (!source_img) {
                this.log_warn(`Unable to interpret bitmap: ${draw_copy.data.src_bitmap.bitmap.format}`);
                return false;
            }

            return this.draw_copy_helper({
                base: draw_copy.base,
                src_area: draw_copy.data.src_area,
                image_data: source_img,
                tag: `bitmap.${draw_copy.data.src_bitmap.bitmap.format}`,
                has_alpha: draw_copy.data.src_bitmap.bitmap.format === Constants.SPICE_BITMAP_FMT_32BIT ? false : true,
                descriptor: draw_copy.data.src_bitmap.descriptor
            });
        }
            else if (draw_copy.data.src_bitmap.descriptor.type == Constants.SPICE_IMAGE_TYPE_LZ_RGB)
            {
                var canvas = this.surfaces[draw_copy.base.surface_id].canvas;
                if (! draw_copy.data.src_bitmap.lz_rgb)
                {
                    this.log_err("null lz_rgb ");
                    return false;
                }

                var source_img = convert_spice_lz_to_web(canvas.context,
                                            draw_copy.data.src_bitmap.lz_rgb);
                if (! source_img)
                {
                    this.log_warn("FIXME: Unable to interpret bitmap of type: " +
                        draw_copy.data.src_bitmap.lz_rgb.type);
                    return false;
                }

                return this.draw_copy_helper(
                    { base: draw_copy.base,
                      src_area: draw_copy.data.src_area,
                      image_data: source_img,
                      tag: "lz_rgb." + draw_copy.data.src_bitmap.lz_rgb.type,
                      has_alpha: draw_copy.data.src_bitmap.lz_rgb.type == Constants.LZ_IMAGE_TYPE_RGBA ? true : false ,
                      descriptor : draw_copy.data.src_bitmap.descriptor
                    });
            }
            else
            {
                this.log_warn("FIXME: DrawCopy unhandled image type: " + draw_copy.data.src_bitmap.descriptor.type);
                this.log_draw("DrawCopy", draw_copy);
                return false;
            }
        }

        this.log_warn("FIXME: DrawCopy no src_bitmap.");
        return false;
    }

if (msg.type === Constants.SPICE_MSG_DISPLAY_DRAW_FILL) {
    const draw_fill = new Messages.SpiceMsgDisplayDrawFill(msg.data);
    
    if (Utils.DEBUG > 1) {
        this.log_draw("DrawFill", draw_fill);
    }

    const { rop_descriptor, mask } = draw_fill.data;
    if (rop_descriptor !== Constants.SPICE_ROPD_OP_PUT) {
        this.log_warn(`Unknown ROPD: ${rop_descriptor}`);
    }
    
    if (mask.flags) {
        this.log_warn(`Unknown mask flag: ${mask.flags}`);
    }
    
    if (mask.bitmap) {
        this.log_warn("Mask not supported");
    }

    if (draw_fill.data.brush.type === Constants.SPICE_BRUSH_TYPE_SOLID) {
        const surfaceId = draw_fill.base.surface_id;
        const surface = this.surfaces[surfaceId];

        if (!surface || !surface.canvas) {
            this.log_err(`Surface ${surfaceId} not found`);
            return false;
        }

        const { context } = surface.canvas;
        const { left, top, right, bottom } = draw_fill.base.box;
        const width = right - left;
        const height = bottom - top;

        const color = draw_fill.data.brush.color & 0xffffff;
        const alpha = (draw_fill.data.brush.color >> 24) & 0xff;
        const hasAlpha = alpha < 0xff;
        const colorStr = hasAlpha 
            ? `rgba(${color >> 16}, ${(color >> 8) & 0xff}, ${color & 0xff}, ${alpha / 255})`
            : `rgb(${color >> 16}, ${(color >> 8) & 0xff}, ${color & 0xff})`;

        context.fillStyle = colorStr;
        context.fillRect(left, top, width, height);

    if (Utils.DUMP_DRAWS && this.parent.dump_id) {
        this.getDebugContainer();
        const info = `Fill Brush Surface ${surfaceId} Draw ${surface.draw_count}`;
        const debugWrapper = this.createDebugCanvas({
            width: surface.canvas.width,
            height: surface.canvas.height,
            id: `fillbrush.${surfaceId}.${surface.draw_count}`,
            imageData: debugCtx.getImageData(0, 0, width, height),
            info: info
        });
        
        this.getDebugContainer().appendChild(debugWrapper);
    }

        surface.draw_count++;
    } 
    else {
        this.log_warn(`Unknown brush type: ${draw_fill.data.brush.type}`);
    }

    return true;
}

    if (msg.type == Constants.SPICE_MSG_DISPLAY_DRAW_OPAQUE)
    {
        this.known_unimplemented(msg.type, "Display Draw Opaque");
        return true;
    }

    if (msg.type == Constants.SPICE_MSG_DISPLAY_DRAW_BLEND)
    {
        this.known_unimplemented(msg.type, "Display Draw Blend");
        return true;
    }

    if (msg.type == Constants.SPICE_MSG_DISPLAY_DRAW_BLACKNESS)
    {
        this.known_unimplemented(msg.type, "Display Draw Blackness");
        return true;
    }

    if (msg.type == Constants.SPICE_MSG_DISPLAY_DRAW_WHITENESS)
    {
        this.known_unimplemented(msg.type, "Display Draw Whiteness");
        return true;
    }

    if (msg.type == Constants.SPICE_MSG_DISPLAY_DRAW_INVERS)
    {
        this.known_unimplemented(msg.type, "Display Draw Invers");
        return true;
    }

    if (msg.type == Constants.SPICE_MSG_DISPLAY_DRAW_ROP3)
    {
        this.known_unimplemented(msg.type, "Display Draw ROP3");
        return true;
    }

    if (msg.type == Constants.SPICE_MSG_DISPLAY_DRAW_STROKE)
    {
        this.known_unimplemented(msg.type, "Display Draw Stroke");
        return true;
    }

    if (msg.type == Constants.SPICE_MSG_DISPLAY_DRAW_TRANSPARENT)
    {
        this.known_unimplemented(msg.type, "Display Draw Transparent");
        return true;
    }

    if (msg.type == Constants.SPICE_MSG_DISPLAY_DRAW_ALPHA_BLEND)
    {
        this.known_unimplemented(msg.type, "Display Draw Alpha Blend");
        return true;
    }

    if (msg.type == Constants.SPICE_MSG_DISPLAY_COPY_BITS)
    {
        var copy_bits = new Messages.SpiceMsgDisplayCopyBits(msg.data);

        Utils.DEBUG > 1 && this.log_draw("CopyBits", copy_bits);

        var source_canvas = this.surfaces[copy_bits.base.surface_id].canvas;
        var source_context = source_canvas.context;

        var width = source_canvas.width - copy_bits.src_pos.x;
        var height = source_canvas.height - copy_bits.src_pos.y;
        if (width > (copy_bits.base.box.right - copy_bits.base.box.left))
            width = copy_bits.base.box.right - copy_bits.base.box.left;
        if (height > (copy_bits.base.box.bottom - copy_bits.base.box.top))
            height = copy_bits.base.box.bottom - copy_bits.base.box.top;

        var source_img = source_context.getImageData(
                copy_bits.src_pos.x, copy_bits.src_pos.y, width, height);
        //source_context.putImageData(source_img, copy_bits.base.box.left, copy_bits.base.box.top);
        putImageDataWithAlpha(source_context, source_img, copy_bits.base.box.left, copy_bits.base.box.top);

        if (Utils.DUMP_DRAWS && this.parent.dump_id) {
            this.getDebugContainer();
            const info = `CopyBits Surface ${copy_bits.base.surface_id} Draw ${this.surfaces[copy_bits.base.surface_id].draw_count}`;
            const debugWrapper = this.createDebugCanvas({
                width: width,
                height: height,
                id: `copybits.${copy_bits.base.surface_id}.${this.surfaces[copy_bits.base.surface_id].draw_count}`,
                imageData: source_img,
                info: info
            });
            
            this.getDebugContainer().appendChild(debugWrapper);
        }


        this.surfaces[copy_bits.base.surface_id].draw_count++;
        return true;
    }

    if (msg.type == Constants.SPICE_MSG_DISPLAY_INVAL_ALL_PIXMAPS)
    {
        this.known_unimplemented(msg.type, "Display Inval All Pixmaps");
        return true;
    }

    if (msg.type == Constants.SPICE_MSG_DISPLAY_INVAL_PALETTE)
    {
        this.known_unimplemented(msg.type, "Display Inval Palette");
        return true;
    }

    if (msg.type == Constants.SPICE_MSG_DISPLAY_INVAL_ALL_PALETTES)
    {
        this.palettes = {}
        return true;
    }

    if (msg.type === Constants.SPICE_MSG_DISPLAY_SURFACE_CREATE) {
        if (!this.surfaces) {
            this.surfaces = [];
        }

        const m = new Messages.SpiceMsgSurfaceCreate(msg.data);
        const { surface_id, width, height, format, flags } = m.surface;
        
        if (Utils.DEBUG > 1) {
            console.log(`${this.type}: MsgSurfaceCreate id ${surface_id}; ${width}x${height}; format ${format}; flags ${flags}`);
        }

        const supportedFormats = [Constants.SPICE_SURFACE_FMT_32_xRGB, Constants.SPICE_SURFACE_FMT_32_ARGB];
        if (!supportedFormats.includes(format)) {
            this.log_warn(`Неподдерживаемый формат поверхности: ${format}`);
            return false;
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        canvas.id = `spice_surface_${surface_id}`;
        canvas.tabIndex = surface_id;
        canvas.context = canvas.getContext('2d');

        if (Utils.DUMP_CANVASES && this.parent?.dump_id) {
            const dumpContainer = document.getElementById(this.parent.dump_id);
            dumpContainer?.appendChild(canvas);
        }

        m.surface.canvas = canvas;
        m.surface.draw_count = 0;
        this.surfaces[surface_id] = m.surface;

        if (flags & Constants.SPICE_SURFACE_FLAGS_PRIMARY) {
            this.primary_surface = surface_id;
            canvas.context.save();

            const screenContainer = document.getElementById(this.parent?.screen_id);
            screenContainer?.appendChild(canvas);
            
            if (screenContainer) {
                screenContainer.style.height = `${height}px`;
            }

            this.hook_events();
        }

        return true;
    }

    if (msg.type == Constants.SPICE_MSG_DISPLAY_SURFACE_DESTROY)
    {
        var m = new Messages.SpiceMsgSurfaceDestroy(msg.data);
        Utils.DEBUG > 1 && console.log(this.type + ": MsgSurfaceDestroy id " + m.surface_id);
        this.delete_surface(m.surface_id);
        return true;
    }

    if (msg.type == Constants.SPICE_MSG_DISPLAY_STREAM_CREATE)
    {
        var m = new Messages.SpiceMsgDisplayStreamCreate(msg.data);
        Utils.STREAM_DEBUG > 0 && console.log(this.type + ": MsgStreamCreate id" + m.id + "; type " + m.codec_type +
                                        "; width " + m.stream_width + "; height " + m.stream_height +
                                        "; left " + m.dest.left + "; top " + m.dest.top
                                        );
        if (!this.streams)
            this.streams = new Array();
        if (this.streams[m.id])
            console.log("Stream " + m.id + " already exists");
        else
            this.streams[m.id] = m;

        if (m.codec_type == Constants.SPICE_VIDEO_CODEC_TYPE_VP8)
        {
            var media = new MediaSource();
            var v = document.createElement("video");
            v.src = window.URL.createObjectURL(media);

            v.setAttribute('muted', true);
            v.setAttribute('autoplay', true);
            v.setAttribute('width', m.stream_width);
            v.setAttribute('height', m.stream_height);

            var left = m.dest.left;
            var top = m.dest.top;
            if (this.surfaces[m.surface_id] !== undefined)
            {
                left += this.surfaces[m.surface_id].canvas.offsetLeft;
                top += this.surfaces[m.surface_id].canvas.offsetTop;
            }
            document.getElementById(this.parent.screen_id).appendChild(v);
            v.setAttribute('style', "pointer-events:none; position: absolute; top:" + top + "px; left:" + left + "px;");

            media.addEventListener('sourceopen', handle_video_source_open, false);
            media.addEventListener('sourceended', handle_video_source_ended, false);
            media.addEventListener('sourceclosed', handle_video_source_closed, false);

            var s = this.streams[m.id];
            s.video = v;
            s.media = media;
            s.queue = new Array();
            s.start_time = 0;
            s.cluster_time = 0;
            s.append_okay = false;

            media.stream = s;
            media.spiceconn = this;
            v.spice_stream = s;
        }
        else if (m.codec_type == Constants.SPICE_VIDEO_CODEC_TYPE_MJPEG)
            this.streams[m.id].frames_loading = 0;
        else
            console.log("Unhandled stream codec: "+m.codec_type);
        return true;
    }

    if (msg.type == Constants.SPICE_MSG_DISPLAY_STREAM_DATA ||
        msg.type == Constants.SPICE_MSG_DISPLAY_STREAM_DATA_SIZED)
    {
        var m;
        if (msg.type == Constants.SPICE_MSG_DISPLAY_STREAM_DATA_SIZED)
            m = new Messages.SpiceMsgDisplayStreamDataSized(msg.data);
        else
            m = new Messages.SpiceMsgDisplayStreamData(msg.data);

        if (!this.streams[m.base.id])
        {
            console.log("no stream for data");
            return false;
        }

        var time_until_due = m.base.multi_media_time - this.parent.relative_now();

        if (this.streams[m.base.id].codec_type === Constants.SPICE_VIDEO_CODEC_TYPE_MJPEG)
            process_mjpeg_stream_data(this, m, time_until_due);

        if (this.streams[m.base.id].codec_type === Constants.SPICE_VIDEO_CODEC_TYPE_VP8)
            process_video_stream_data(this.streams[m.base.id], m);

        return true;
    }

    if (msg.type == Constants.SPICE_MSG_DISPLAY_STREAM_ACTIVATE_REPORT)
    {
        var m = new Messages.SpiceMsgDisplayStreamActivateReport(msg.data);

        var report = new Messages.SpiceMsgcDisplayStreamReport(m.stream_id, m.unique_id);
        if (this.streams[m.stream_id])
        {
            this.streams[m.stream_id].report = report;
            this.streams[m.stream_id].max_window_size = m.max_window_size;
            this.streams[m.stream_id].timeout_ms = m.timeout_ms
        }

        return true;
    }

    if (msg.type == Constants.SPICE_MSG_DISPLAY_STREAM_CLIP)
    {
        var m = new Messages.SpiceMsgDisplayStreamClip(msg.data);
        Utils.STREAM_DEBUG > 1 && console.log(this.type + ": MsgStreamClip id" + m.id);
        this.streams[m.id].clip = m.clip;
        return true;
    }

    if (msg.type == Constants.SPICE_MSG_DISPLAY_STREAM_DESTROY)
    {
        var m = new Messages.SpiceMsgDisplayStreamDestroy(msg.data);
        Utils.STREAM_DEBUG > 0 && console.log(this.type + ": MsgStreamDestroy id" + m.id);

        if (this.streams[m.id].codec_type == Constants.SPICE_VIDEO_CODEC_TYPE_VP8)
        {
            document.getElementById(this.parent.screen_id).removeChild(this.streams[m.id].video);
            this.streams[m.id].source_buffer = null;
            this.streams[m.id].media = null;
            this.streams[m.id].video = null;
        }
        this.streams[m.id] = undefined;
        return true;
    }

    if (msg.type == Constants.SPICE_MSG_DISPLAY_STREAM_DESTROY_ALL)
    {
        this.known_unimplemented(msg.type, "Display Stream Destroy All");
        return true;
    }

    if (msg.type == Constants.SPICE_MSG_DISPLAY_INVAL_LIST)
    {
        var m = new Messages.SpiceMsgDisplayInvalList(msg.data);
        var i;
        Utils.DEBUG > 1 && console.log(this.type + ": MsgInvalList " + m.count + " items");
        for (i = 0; i < m.count; i++)
            if (this.cache[m.resources[i].id] != undefined)
                delete this.cache[m.resources[i].id];
        return true;
    }

    if (msg.type == Constants.SPICE_MSG_DISPLAY_MONITORS_CONFIG)
    {
        this.known_unimplemented(msg.type, "Display Monitors Config");
        return true;
    }

    if (msg.type == Constants.SPICE_MSG_DISPLAY_DRAW_COMPOSITE)
    {
        this.known_unimplemented(msg.type, "Display Draw Composite");
        return true;
    }

    return false;
}

SpiceDisplayConn.prototype.delete_surface = function(surface_id)
{
    var canvas = document.getElementById("spice_surface_" + surface_id);
    if (Utils.DUMP_CANVASES && this.parent.dump_id)
        document.getElementById(this.parent.dump_id).removeChild(canvas);
    if (this.primary_surface == surface_id)
    {
        this.unhook_events();
        this.primary_surface = undefined;
        document.getElementById(this.parent.screen_id).removeChild(canvas);
    }

    delete this.surfaces[surface_id];
}


SpiceDisplayConn.prototype.draw_copy_helper = function(o) {
    const surfaceId = o.base.surface_id;
    const surface = this.surfaces[surfaceId];
    
    if (!surface || !surface.canvas) {
        this.log_err(`Surface ${surfaceId} not found`);
        return false;
    }

    const canvas = surface.canvas;
    const context = canvas.context;
    const format = surface.format;

    const box = o.base.box;
    const clearLeft = Math.max(0, box.left - 2);
    const clearTop = Math.max(0, box.top - 2);
    const clearWidth = Math.min(canvas.width - clearLeft, box.right - box.left + 4);
    const clearHeight = Math.min(canvas.height - clearTop, box.bottom - box.top + 4);

    if (Utils.DEBUG > 1) {
        context.fillStyle = 'rgba(255, 0, 0, 0.7)';
        context.fillRect(clearLeft, clearTop, clearWidth, clearHeight);
    }

    if (o.has_alpha) {
        if (format === Constants.SPICE_SURFACE_FMT_32_xRGB) {
            stripAlpha(o.image_data);
            context.putImageData(o.image_data, o.base.box.left, o.base.box.top);
        } else {
            putImageDataWithAlpha(context, o.image_data, o.base.box.left, o.base.box.top);
        }
    } else {
        context.putImageData(o.image_data, o.base.box.left, o.base.box.top);
    }

    if (o.descriptor && (o.descriptor.flags & Constants.SPICE_IMAGE_FLAGS_CACHE_ME)) {
        this.cache = this.cache || new Map();
        this.cache.set(o.descriptor.id, o.image_data);
    }

    if (Utils.DUMP_DRAWS && this.parent?.dump_id) {
        this.getDebugContainer();
        const info = `Surface ${surfaceId} Draw ${surface.draw_count}: ${o.tag}`;
        const debugWrapper = this.createDebugCanvas({
            width: o.image_data.width,
            height: o.image_data.height,
            id: `${o.tag}.${surface.draw_count}.${surfaceId}@${o.base.box.left}x${o.base.box.top}`,
            imageData: o.image_data,
            info: info
        });
        
        this.getDebugContainer().appendChild(debugWrapper);
    }

    surface.draw_count++;
    return true;
};


SpiceDisplayConn.prototype.log_draw = function(prefix, draw)
{
    var str = prefix + "." + draw.base.surface_id + "." + this.surfaces[draw.base.surface_id].draw_count + ": ";
    str += "base.box " + draw.base.box.left + ", " + draw.base.box.top + " to " +
                           draw.base.box.right + ", " + draw.base.box.bottom;
    str += "; clip.type " + draw.base.clip.type;

    if (draw.data)
    {
        if (draw.data.src_area)
            str += "; src_area " + draw.data.src_area.left + ", " + draw.data.src_area.top + " to "
                                 + draw.data.src_area.right + ", " + draw.data.src_area.bottom;

        if (draw.data.src_bitmap && draw.data.src_bitmap != null)
        {
            str += "; src_bitmap id: " + draw.data.src_bitmap.descriptor.id;
            str += "; src_bitmap width " + draw.data.src_bitmap.descriptor.width + ", height " + draw.data.src_bitmap.descriptor.height;
            str += "; src_bitmap type " + draw.data.src_bitmap.descriptor.type + ", flags " + draw.data.src_bitmap.descriptor.flags;
            if (draw.data.src_bitmap.surface_id !== undefined)
                str += "; src_bitmap surface_id " + draw.data.src_bitmap.surface_id;
            if (draw.data.src_bitmap.bitmap)
                str += "; BITMAP format " + draw.data.src_bitmap.bitmap.format +
                        "; flags " + draw.data.src_bitmap.bitmap.flags +
                        "; x " + draw.data.src_bitmap.bitmap.x +
                        "; y " + draw.data.src_bitmap.bitmap.y +
                        "; stride " + draw.data.src_bitmap.bitmap.stride ;
            if (draw.data.src_bitmap.quic)
                str += "; QUIC type " + draw.data.src_bitmap.quic.type +
                        "; width " + draw.data.src_bitmap.quic.width +
                        "; height " + draw.data.src_bitmap.quic.height ;
            if (draw.data.src_bitmap.lz_rgb)
                str += "; LZ_RGB length " + draw.data.src_bitmap.lz_rgb.length +
                       "; magic " + draw.data.src_bitmap.lz_rgb.magic +
                       "; version 0x" + draw.data.src_bitmap.lz_rgb.version.toString(16) +
                       "; type " + draw.data.src_bitmap.lz_rgb.type +
                       "; width " + draw.data.src_bitmap.lz_rgb.width +
                       "; height " + draw.data.src_bitmap.lz_rgb.height +
                       "; stride " + draw.data.src_bitmap.lz_rgb.stride +
                       "; top down " + draw.data.src_bitmap.lz_rgb.top_down;
        }
        else
            str += "; src_bitmap is null";

        if (draw.data.brush)
        {
            if (draw.data.brush.type == Constants.SPICE_BRUSH_TYPE_SOLID)
                str += "; brush.color 0x" + draw.data.brush.color.toString(16);
            if (draw.data.brush.type == Constants.SPICE_BRUSH_TYPE_PATTERN)
            {
                str += "; brush.pat ";
                if (draw.data.brush.pattern.pat != null)
                    str += "[SpiceImage]";
                else
                    str += "[null]";
                str += " at " + draw.data.brush.pattern.pos.x + ", " + draw.data.brush.pattern.pos.y;
            }
        }

        str += "; rop_descriptor " + draw.data.rop_descriptor;
        if (draw.data.scale_mode !== undefined)
            str += "; scale_mode " + draw.data.scale_mode;
        str += "; mask.flags " + draw.data.mask.flags;
        str += "; mask.pos " + draw.data.mask.pos.x + ", " + draw.data.mask.pos.y;
        if (draw.data.mask.bitmap != null)
        {
            str += "; mask.bitmap width " + draw.data.mask.bitmap.descriptor.width + ", height " + draw.data.mask.bitmap.descriptor.height;
            str += "; mask.bitmap type " + draw.data.mask.bitmap.descriptor.type + ", flags " + draw.data.mask.bitmap.descriptor.flags;
        }
        else
            str += "; mask.bitmap is null";
    }

    console.log(str);
}

SpiceDisplayConn.prototype.hook_events = function()
{
    if (this.primary_surface !== undefined)
    {
        var canvas = this.surfaces[this.primary_surface].canvas;
        canvas.sc = this.parent;
        canvas.addEventListener('mousemove', Inputs.handle_mousemove);
        canvas.addEventListener('mousedown', Inputs.handle_mousedown);
        canvas.addEventListener('contextmenu', Inputs.handle_contextmenu);
        canvas.addEventListener('mouseup', Inputs.handle_mouseup);
        canvas.addEventListener('keydown', Inputs.handle_keydown);
        canvas.addEventListener('keyup', Inputs.handle_keyup);
        canvas.addEventListener('mouseout', handle_mouseout);
        canvas.addEventListener('mouseover', handle_mouseover);
        canvas.addEventListener('wheel', Inputs.handle_mousewheel);
        canvas.focus();
    }
}

SpiceDisplayConn.prototype.unhook_events = function()
{
    if (this.primary_surface !== undefined)
    {
        var canvas = this.surfaces[this.primary_surface].canvas;
        canvas.removeEventListener('mousemove', Inputs.handle_mousemove);
        canvas.removeEventListener('mousedown', Inputs.handle_mousedown);
        canvas.removeEventListener('contextmenu', Inputs.handle_contextmenu);
        canvas.removeEventListener('mouseup', Inputs.handle_mouseup);
        canvas.removeEventListener('keydown', Inputs.handle_keydown);
        canvas.removeEventListener('keyup', Inputs.handle_keyup);
        canvas.removeEventListener('mouseout', handle_mouseout);
        canvas.removeEventListener('mouseover', handle_mouseover);
        canvas.removeEventListener('wheel', Inputs.handle_mousewheel);
    }
}


SpiceDisplayConn.prototype.destroy_surfaces = function()
{
    for (var s in this.surfaces)
    {
        this.delete_surface(this.surfaces[s].surface_id);
    }

    this.surfaces = undefined;
    if (this.debugWindow && !this.debugWindow.closed) {
        this.debugWindow.close();
    }
    this.debugWindow = null;
    this.debugContainer = null;
}

SpiceDisplayConn.prototype.getDebugContainer = function() {
    if (!this.debugWindow || this.debugWindow.closed) {
        this.debugWindow = window.open('', 'SpiceDisplayDebug', 'width=1200,height=800,scrollbars=yes');
        this.debugWindow.document.title = 'Spice Display Debug';
        
        const style = this.debugWindow.document.createElement('style');
        style.textContent = `
            body { font-family: Arial, sans-serif; padding: 10px; margin: 0; }
            #debug-container { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 10px; }
            .debug-canvas { border: 1px solid #ccc; padding: 5px; background: #f9f9f9; }
            .canvas-info { font-size: 12px; color: #666; margin-bottom: 5px; }
        `;
        this.debugWindow.document.head.appendChild(style);

        this.debugContainer = this.debugWindow.document.createElement('div');
        this.debugContainer.id = 'debug-container';
        this.debugContainer.style.overflowY = 'auto';
        this.debugContainer.style.maxHeight = 'calc(100vh - 100px)';
        this.debugContainer.style.width = '100%';
        this.debugContainer.style.boxSizing = 'border-box';
        this.debugWindow.document.body.appendChild(this.debugContainer);

        const clearBtn = this.debugWindow.document.createElement('button');
        clearBtn.textContent = 'Clear All';
        clearBtn.style.position = 'fixed';
        clearBtn.style.top = '10px';
        clearBtn.style.right = '10px';
        clearBtn.style.zIndex = '1000';
        clearBtn.style.padding = '6px 12px';
        clearBtn.style.backgroundColor = '#ff4d4d';
        clearBtn.style.color = 'white';
        clearBtn.style.border = 'none';
        clearBtn.style.borderRadius = '4px';
        clearBtn.style.cursor = 'pointer';

        clearBtn.onclick = () => {
            this.debugContainer.innerHTML = '';
        };

        this.debugWindow.document.body.appendChild(clearBtn);
        this.addScrollHandler();

    }
    return this.debugContainer;
};

SpiceDisplayConn.prototype.createDebugCanvas = function(options) {
    const { width, height, id, imageData, info } = options;

    const container = this.getDebugContainer();

    const wrapper = container.ownerDocument.createElement('div');
    wrapper.className = 'debug-canvas';

    const infoDiv = container.ownerDocument.createElement('div');
    infoDiv.className = 'canvas-info';
    infoDiv.textContent = info;
    wrapper.appendChild(infoDiv);

    const canvas = container.ownerDocument.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    canvas.id = id;

    const ctx = canvas.getContext('2d');
    ctx.putImageData(imageData, 0, 0);

    wrapper.appendChild(canvas);
    
    container.appendChild(wrapper);
    
    this.autoScrollDebugContainer();
    
    return wrapper;
};

SpiceDisplayConn.prototype.addClearButton = function() {
    if (!this.debugWindow || this.debugWindow.closed) return;
    
    const clearBtn = this.debugWindow.document.createElement('button');
    clearBtn.textContent = 'Clear All';
    clearBtn.style.position = 'fixed';
    clearBtn.style.top = '10px';
    clearBtn.style.right = '10px';
    clearBtn.style.zIndex = '1000';
    
    clearBtn.onclick = () => {
        this.debugContainer.innerHTML = '';
    };
    
    this.debugWindow.document.body.appendChild(clearBtn);
};

SpiceDisplayConn.prototype.autoScrollDebugContainer = function() {
    if (!this.debugContainer || !this.debugWindow) return;

    const shouldAutoScroll = () => {
        const threshold = 100;
        const position = this.debugContainer.scrollTop + this.debugContainer.clientHeight;
        const height = this.debugContainer.scrollHeight;
        return height - position <= threshold;
    };

    if (shouldAutoScroll()) {
        this.debugContainer.scrollTop = this.debugContainer.scrollHeight;
    }
};

SpiceDisplayConn.prototype.addAutoScrollToggle = function() {
    if (!this.debugContainer || !this.debugWindow) return;

    const toggleBtn = this.debugWindow.document.createElement('button');
    toggleBtn.textContent = 'Auto Scroll: ON';
    toggleBtn.style.position = 'fixed';
    toggleBtn.style.top = '50px';
    toggleBtn.style.right = '10px';
    toggleBtn.style.zIndex = '1000';
    toggleBtn.style.padding = '6px 12px';
    toggleBtn.style.backgroundColor = '#4CAF50';
    toggleBtn.style.color = 'white';
    toggleBtn.style.border = 'none';
    toggleBtn.style.borderRadius = '4px';
    toggleBtn.style.cursor = 'pointer';

    let autoScrollEnabled = true;

    toggleBtn.onclick = () => {
        autoScrollEnabled = !autoScrollEnabled;
        toggleBtn.textContent = `Auto Scroll: ${autoScrollEnabled ? 'ON' : 'OFF'}`;
        
        this.autoScrollDebugContainer = autoScrollEnabled 
            ? this.autoScrollDebugContainer 
            : () => {};
    };

    this.debugWindow.document.body.appendChild(toggleBtn);
};

SpiceDisplayConn.prototype.addScrollHandler = function() {
    if (!this.debugContainer || !this.debugWindow) return;

    let isUserScrolling = false;

    this.debugContainer.addEventListener('scroll', () => {
        isUserScrolling = true;
        setTimeout(() => {
            isUserScrolling = false;
        }, 100);
    });

    this.autoScrollDebugContainer = function() {
        if (!this.debugContainer || !this.debugWindow) return;

        if (!isUserScrolling) {
            this.debugContainer.scrollTop = this.debugContainer.scrollHeight;
        }
    };
};

function handle_mouseover(e)
{
    this.focus();
}

function handle_mouseout(e)
{
    if (this.sc && this.sc.cursor && this.sc.cursor.spice_simulated_cursor)
        this.sc.cursor.spice_simulated_cursor.style.display = 'none';
    this.blur();
}

function handle_draw_jpeg_onload() {
    const o = this.o;
    const sc = o?.sc;
    const streams = sc?.streams;

    if (o && streams && streams[o.id]) {
        streams[o.id].frames_loading--;
    }

    const surfaceId = o?.base?.surface_id;
    const surface = sc?.surfaces?.[surfaceId];
    let context = null;
    let isSurfaceValid = false;

    if (surface) {
        context = surface.canvas?.context || null;
        isSurfaceValid = !!context;
    } else {
        Utils.DEBUG > 2 && sc?.log_info?.(`Discarding jpeg; presumed lost surface ${surfaceId || 'unknown'}`);
    }

    const width = this.width;
    const height = this.height;

    const offscreenCanvas = new OffscreenCanvas(width, height);
    const offscreenCtx = offscreenCanvas.getContext('2d');

    const needsFlipping = o.flip;

    if (needsFlipping) {
        offscreenCtx.save();
        offscreenCtx.translate(0, height);
        offscreenCtx.scale(1, -1);
        offscreenCtx.drawImage(this, 0, 0, width, height);
        offscreenCtx.restore();
    } else {
        offscreenCtx.drawImage(this, 0, 0, width, height);
    }

    const tempCanvas = new OffscreenCanvas(width, height);
    const tempCtx = tempCanvas.getContext('2d');
    tempCtx.drawImage(offscreenCanvas, 0, 0, width, height);

    const processedImageData = tempCtx.getImageData(0, 0, width, height);

    const draw_copy = {
        base: o.base,
        data: {
            src_area: {
                left: 0,
                top: 0,
                right: width,
                bottom: height
            },
            src_bitmap: {
                descriptor: null
            }
        },
        image_data: processedImageData
    };

    sc.draw_copy_helper(draw_copy);
}


function process_mjpeg_stream_data(sc, m, time_until_due) {
    const streamId = m.base.id;
    const stream = sc.streams[streamId];

    if (time_until_due < 0 && stream?.frames_loading > 0) {
        if (stream.report) {
            stream.report.num_drops++;
        }
        return;
    }

    if (!m.data || m.data.length === 0) {
        sc.log_err("Нет данных в MJPEG кадре");
        return;
    }

    let imageDataArray = m.data;
    if (typeof imageDataArray === 'string') {
        const array = new Uint8Array(imageDataArray.length);
        for (let i = 0; i < imageDataArray.length; i++) {
            array[i] = imageDataArray.charCodeAt(i);
        }
        imageDataArray = array;
    }

    const blob = new Blob([imageDataArray], { type: 'image/jpeg' });

    const strm_base = new Messages.SpiceMsgDisplayBase();
    strm_base.surface_id = stream.surface_id;
    strm_base.box = m.dest || stream.dest;
    strm_base.clip = stream.clip;
    const surface = sc.surfaces[stream.surface_id];
    const shouldFlip = !stream.flags & 1; // 1 -- TOPDOWN FLAG

    const img = new Image();
    img.o = {
        base: strm_base,
        tag: `mjpeg.${streamId}`,
        descriptor: null,
        sc,
        id: streamId,
        msg_mmtime: m.base.multi_media_time,
        flip: shouldFlip,
    };

    img.onload = () => {
        handle_draw_jpeg_onload.call(img);
        URL.revokeObjectURL(img.src);
    };

    img.onerror = () => {
        sc.log_err("Ошибка загрузки MJPEG кадра");
        if (stream) {
            stream.frames_loading--;
        }
    };

    img.src = URL.createObjectURL(blob);

    if (stream) {
        stream.frames_loading++;
    }
}

function process_stream_data_report(sc, id, msg_mmtime, time_until_due)
{
    sc.streams[id].report.num_frames++;
    if (sc.streams[id].report.start_frame_mm_time == 0)
        sc.streams[id].report.start_frame_mm_time = msg_mmtime;

    if (sc.streams[id].report.num_frames > sc.streams[id].max_window_size ||
        (msg_mmtime - sc.streams[id].report.start_frame_mm_time) > sc.streams[id].timeout_ms)
    {
        sc.streams[id].report.end_frame_mm_time = msg_mmtime;
        sc.streams[id].report.last_frame_delay = time_until_due;

        var msg = new Messages.SpiceMiniData();
        msg.build_msg(Constants.SPICE_MSGC_DISPLAY_STREAM_REPORT, sc.streams[id].report);
        sc.send_msg(msg);

        sc.streams[id].report.start_frame_mm_time = 0;
        sc.streams[id].report.num_frames = 0;
        sc.streams[id].report.num_drops = 0;
    }
}

function handle_video_source_open(e)
{
    var stream = this.stream;
    var p = this.spiceconn;

    if (stream.source_buffer)
        return;

    var s = this.addSourceBuffer(Webm.Constants.SPICE_VP8_CODEC);
    if (! s)
    {
        p.log_err('Codec ' + Webm.Constants.SPICE_VP8_CODEC + ' not available.');
        return;
    }

    stream.source_buffer = s;
    s.spiceconn = p;
    s.stream = stream;

    listen_for_video_events(stream);

    var h = new Webm.Header();
    var te = new Webm.VideoTrackEntry(this.stream.stream_width, this.stream.stream_height);
    var t = new Webm.Tracks(te);

    var mb = new ArrayBuffer(h.buffer_size() + t.buffer_size())

    var b = h.to_buffer(mb);
    t.to_buffer(mb, b);

    s.addEventListener('error', handle_video_buffer_error, false);
    s.addEventListener('updateend', handle_append_video_buffer_done, false);

    append_video_buffer(s, mb);
}

function handle_video_source_ended(e)
{
    var p = this.spiceconn;
    p.log_err('Video source unexpectedly ended.');
}

function handle_video_source_closed(e)
{
    var p = this.spiceconn;
    p.log_err('Video source unexpectedly closed.');
}

function append_video_buffer(sb, mb)
{
    try
    {
        sb.stream.append_okay = false;
        sb.appendBuffer(mb);
    }
    catch (e)
    {
        var p = sb.spiceconn;
        p.log_err("Error invoking appendBuffer: " + e.message);
    }
}

function handle_append_video_buffer_done(e)
{
    var stream = this.stream;

    if (stream.current_frame && "report" in stream)
    {
        var sc = this.stream.media.spiceconn;
        var t = this.stream.current_frame.msg_mmtime;
        process_stream_data_report(sc, stream.id, t, t - sc.parent.relative_now());
    }

    if (stream.queue.length > 0)
    {
        stream.current_frame = stream.queue.shift();
        append_video_buffer(stream.source_buffer, stream.current_frame.mb);
    }
    else
    {
        stream.append_okay = true;
    }

    if (!stream.video)
    {
        if (Utils.STREAM_DEBUG > 0)
            console.log("Stream id " + stream.id + " received updateend after video is gone.");
        return;
    }

    if (stream.video.buffered.length > 0 &&
        stream.video.currentTime < stream.video.buffered.start(stream.video.buffered.length - 1))
    {
        console.log("Video appears to have fallen behind; advancing to " +
            stream.video.buffered.start(stream.video.buffered.length - 1));
        stream.video.currentTime = stream.video.buffered.start(stream.video.buffered.length - 1);
    }

    /* Modern browsers try not to auto play video. */
    if (this.stream.video.paused && this.stream.video.readyState >= 2)
        var promise = this.stream.video.play();

    if (Utils.STREAM_DEBUG > 1)
        console.log(stream.video.currentTime + ":id " +  stream.id + " updateend " + Utils.dump_media_element(stream.video));
}

function handle_video_buffer_error(e)
{
    var p = this.spiceconn;
    p.log_err('source_buffer error ' + e.message);
}

function push_or_queue(stream, msg, mb)
{
    var frame =
    {
        msg_mmtime : msg.base.multi_media_time,
    };

    if (stream.append_okay)
    {
        stream.current_frame = frame;
        append_video_buffer(stream.source_buffer, mb);
    }
    else
    {
        frame.mb = mb;
        stream.queue.push(frame);
    }
}

function video_simple_block(stream, msg, keyframe)
{
    var simple = new Webm.SimpleBlock(msg.base.multi_media_time - stream.cluster_time, msg.data, keyframe);
    var mb = new ArrayBuffer(simple.buffer_size());
    simple.to_buffer(mb);

    push_or_queue(stream, msg, mb);
}

function new_video_cluster(stream, msg)
{
    stream.cluster_time = msg.base.multi_media_time;
    var c = new Webm.Cluster(stream.cluster_time - stream.start_time, msg.data);

    var mb = new ArrayBuffer(c.buffer_size());
    c.to_buffer(mb);

    push_or_queue(stream, msg, mb);

    video_simple_block(stream, msg, true);
}

function process_video_stream_data(stream, msg)
{
    if (stream.start_time == 0)
    {
        stream.start_time = msg.base.multi_media_time;
        new_video_cluster(stream, msg);
    }

    else if (msg.base.multi_media_time - stream.cluster_time >= Webm.Constants.MAX_CLUSTER_TIME)
        new_video_cluster(stream, msg);
    else
        video_simple_block(stream, msg, false);
}

function video_handle_event_debug(e)
{
    var s = this.spice_stream;
    if (s.video)
    {
        if (Utils.STREAM_DEBUG > 0 || s.video.buffered.len > 1)
            console.log(s.video.currentTime + ":id " +  s.id + " event " + e.type +
                Utils.dump_media_element(s.video));
    }

    if (Utils.STREAM_DEBUG > 1 && s.media)
        console.log("  media_source " + Utils.dump_media_source(s.media));

    if (Utils.STREAM_DEBUG > 1 && s.source_buffer)
        console.log("  source_buffer " + Utils.dump_source_buffer(s.source_buffer));

    if (Utils.STREAM_DEBUG > 1 || s.queue.length > 1)
        console.log('  queue len ' + s.queue.length + '; append_okay: ' + s.append_okay);
}

function video_debug_listen_for_one_event(name)
{
    this.addEventListener(name, video_handle_event_debug);
}

function listen_for_video_events(stream)
{
    var video_0_events = [
        "abort", "error"
    ];

    var video_1_events = [
        "loadstart", "suspend", "emptied", "stalled", "loadedmetadata", "loadeddata", "canplay",
        "canplaythrough", "playing", "waiting", "seeking", "seeked", "ended", "durationchange",
        "play", "pause", "ratechange"
    ];

    var video_2_events = [
        "timeupdate",
        "progress",
        "resize",
        "volumechange"
    ];

    video_0_events.forEach(video_debug_listen_for_one_event, stream.video);
    if (Utils.STREAM_DEBUG > 0)
        video_1_events.forEach(video_debug_listen_for_one_event, stream.video);
    if (Utils.STREAM_DEBUG > 1)
        video_2_events.forEach(video_debug_listen_for_one_event, stream.video);
}

export {
  SpiceDisplayConn,
};