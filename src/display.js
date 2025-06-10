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


function putImageDataWithAlpha(context, d, x, y) {
    if (!this.tempCanvas) {
        this.tempCanvas = document.createElement("canvas");
        this.tempCanvasContext = this.tempCanvas.getContext("2d");
    }
    this.tempCanvas.width = d.width;
    this.tempCanvas.height = d.height;
    this.tempCanvasContext.putImageData(d, 0, 0);
    context.drawImage(this.tempCanvas, x, y, d.width, d.height);
}


function stripAlpha(d) {
    const data = d.data;
    for (let i = 3; i < data.length; i += 4) {
        data[i] = 255;
    }
}


function SpiceDisplayConn() {
    SpiceConn.apply(this, arguments);
    this.tempCanvas = null; // Shared temporary canvas for putImageDataWithAlpha
    this.tempCanvasContext = null;
    this.pendingImages = new Map();
}

SpiceDisplayConn.prototype = Object.create(SpiceConn.prototype);
SpiceDisplayConn.prototype.process_channel_message = function(msg) {
    switch (msg.type) {
        case Constants.SPICE_MSG_DISPLAY_MODE:
            this.known_unimplemented(msg.type, "Display Mode");
            return true;

        case Constants.SPICE_MSG_DISPLAY_MARK:
            this.known_unimplemented(msg.type, "Display Mark");
            return true;

        case Constants.SPICE_MSG_DISPLAY_RESET:
            if (Utils.DEBUG > 2) console.log("Display reset");
            this.surfaces[this.primary_surface]?.canvas.context.restore();
            return true;

        case Constants.SPICE_MSG_DISPLAY_DRAW_COPY: {
            const draw_copy = new Messages.SpiceMsgDisplayDrawCopy(msg.data);
            if (Utils.DEBUG > 1) this.log_draw("DrawCopy", draw_copy);

            if (!draw_copy.base.box.is_same_size(draw_copy.data.src_area)) {
                this.log_warn("FIXME: DrawCopy src_area is a different size than base.box; we do not handle that yet.");
            }
            if (draw_copy.data.rop_descriptor !== Constants.SPICE_ROPD_OP_PUT) {
                this.log_warn("FIXME: DrawCopy we don't handle ropd type: " + draw_copy.data.rop_descriptor);
            }
            if (draw_copy.data.mask.flags) {
                this.log_warn("FIXME: DrawCopy we don't handle mask flag: " + draw_copy.data.mask.flags);
            }
            if (draw_copy.data.mask.bitmap) {
                this.log_warn("FIXME: DrawCopy we don't handle mask");
            }

            if (!draw_copy.data?.src_bitmap) {
                this.log_warn("FIXME: DrawCopy no src_bitmap.");
                return false;
            }

            const { src_bitmap } = draw_copy.data;
            const flags = src_bitmap.descriptor.flags;
            if (flags && flags !== Constants.SPICE_IMAGE_FLAGS_CACHE_ME && flags !== Constants.SPICE_IMAGE_FLAGS_HIGH_BITS_SET) {
                this.log_warn("FIXME: DrawCopy unhandled image flags: " + flags);
                if (Utils.DEBUG <= 1) this.log_draw("DrawCopy", draw_copy);
            }

            const canvas = this.surfaces[draw_copy.base.surface_id]?.canvas;
            if (!canvas) return false;
            const context = canvas.context;

            let clipApplied = false;
            if (draw_copy.base.clip.type === Constants.SPICE_CLIP_TYPE_RECTS && draw_copy.base.clip.rects && draw_copy.base.clip.rects.rects) {
                context.save();
                context.beginPath();
                const rects = draw_copy.base.clip.rects.rects;
                for (const rect of rects) {
                    context.rect(rect.left, rect.top, rect.right - rect.left, rect.bottom - rect.top);
                }
                context.clip();
                clipApplied = true;
            }

            let result;
            switch (src_bitmap.descriptor.type) {
                case Constants.SPICE_IMAGE_TYPE_QUIC: {
                    if (!src_bitmap.quic) {
                        this.log_warn("FIXME: DrawCopy could not handle this QUIC file.");
                        return false;
                    }
                    const source_img = Quic.convert_spice_quic_to_web(canvas.context, src_bitmap.quic);
                    result = this.draw_copy_helper({
                        base: draw_copy.base,
                        src_area: draw_copy.data.src_area,
                        image_data: source_img,
                        tag: `copyquic.${src_bitmap.quic.type}`,
                        has_alpha: src_bitmap.quic.type === Quic.Constants.QUIC_IMAGE_TYPE_RGBA,
                        descriptor: src_bitmap.descriptor
                    });
                    break;
                }

                case Constants.SPICE_IMAGE_TYPE_FROM_CACHE:
                case Constants.SPICE_IMAGE_TYPE_FROM_CACHE_LOSSLESS: {
                    if (!this.cache?.[src_bitmap.descriptor.id]) {
                        this.log_warn("FIXME: DrawCopy did not find image id " + src_bitmap.descriptor.id + " in cache.");
                        return false;
                    }
                    result = this.draw_copy_helper({
                        base: draw_copy.base,
                        src_area: draw_copy.data.src_area,
                        image_data: this.cache[src_bitmap.descriptor.id],
                        tag: `copycache.${src_bitmap.descriptor.id}`,
                        has_alpha: true, // TODO: Verify if this should be false in some cases
                        descriptor: src_bitmap.descriptor
                    });
                    break;
                }

                case Constants.SPICE_IMAGE_TYPE_SURFACE: {
                    const source_context = this.surfaces[src_bitmap.surface_id]?.canvas.context;
                    const target_context = canvas.context;
                    if (!source_context || !target_context) return false;

                    const width = draw_copy.data.src_area.right - draw_copy.data.src_area.left;
                    const height = draw_copy.data.src_area.bottom - draw_copy.data.src_area.top;
                    const source_img = source_context.getImageData(
                        draw_copy.data.src_area.left, draw_copy.data.src_area.top,
                        width, height
                    );
                    const computed_src_area = new SpiceRect();
                    computed_src_area.top = computed_src_area.left = 0;
                    computed_src_area.right = source_img.width;
                    computed_src_area.bottom = source_img.height;

                    result = this.draw_copy_helper({
                        base: draw_copy.base,
                        src_area: computed_src_area,
                        image_data: source_img,
                        tag: `copysurf.${src_bitmap.surface_id}`,
                        has_alpha: this.surfaces[src_bitmap.surface_id].format !== Constants.SPICE_SURFACE_FMT_32_xRGB,
                        descriptor: src_bitmap.descriptor
                    });
                    break;
                }

                case Constants.SPICE_IMAGE_TYPE_JPEG:
                case Constants.SPICE_IMAGE_TYPE_JPEG_ALPHA: {
                    const isJpegAlpha = src_bitmap.descriptor.type === Constants.SPICE_IMAGE_TYPE_JPEG_ALPHA;
                    const jpegData = isJpegAlpha ? src_bitmap.jpeg_alpha?.data : src_bitmap.jpeg?.data;
                    if (!jpegData) {
                        this.log_warn(`FIXME: DrawCopy could not handle this ${isJpegAlpha ? "JPEG ALPHA" : "JPEG"} file.`);
                        return false;
                    }

                    const blob = new Blob([new Uint8Array(jpegData)], { type: "image/jpeg" });
                    const img = new Image();
                    img.o = {
                        base: draw_copy.base,
                        tag: `jpeg.${src_bitmap.descriptor.id}`,
                        descriptor: src_bitmap.descriptor,
                        sc: this,
                        clip: draw_copy.base.clip // Include clip information
                    };

                    if (isJpegAlpha && this.surfaces[draw_copy.base.surface_id].format === Constants.SPICE_SURFACE_FMT_32_ARGB) {
                        img.alpha_img = convert_spice_lz_to_web(canvas.context, src_bitmap.jpeg_alpha.alpha);
                    }

                    const promise = new Promise(resolve => img.onload = () => { handle_draw_jpeg_onload.call(img); resolve(); });
                    this.pendingImages.set(`jpeg.${src_bitmap.descriptor.id}`, promise);
                    img.src = URL.createObjectURL(blob);
                    result = true;
                    break;
                }

                case Constants.SPICE_IMAGE_TYPE_BITMAP: {
                    if (!src_bitmap.bitmap) {
                        this.log_err("null bitmap");
                        return false;
                    }
                    const source_img = convert_spice_bitmap_to_web(canvas.context, src_bitmap.bitmap);
                    if (!source_img) {
                        this.log_warn("FIXME: Unable to interpret bitmap of format: " + src_bitmap.bitmap.format);
                        return false;
                    }
                    result = this.draw_copy_helper({
                        base: draw_copy.base,
                        src_area: draw_copy.data.src_area,
                        image_data: source_img,
                        tag: `bitmap.${src_bitmap.bitmap.format}`,
                        has_alpha: src_bitmap.bitmap.format !== Constants.SPICE_BITMAP_FMT_32BIT,
                        descriptor: src_bitmap.descriptor
                    });
                    break;
                }

                case Constants.SPICE_IMAGE_TYPE_LZ_RGB: {
                    if (!src_bitmap.lz_rgb) {
                        this.log_err("null lz_rgb");
                        return false;
                    }
                    const source_img = convert_spice_lz_to_web(canvas.context, src_bitmap.lz_rgb);
                    if (!source_img) {
                        this.log_warn("FIXME: Unable to interpret bitmap of type: " + src_bitmap.lz_rgb.type);
                        return false;
                    }
                    result = this.draw_copy_helper({
                        base: draw_copy.base,
                        src_area: draw_copy.data.src_area,
                        image_data: source_img,
                        tag: `lz_rgb.${src_bitmap.lz_rgb.type}`,
                        has_alpha: src_bitmap.lz_rgb.type === Constants.LZ_IMAGE_TYPE_RGBA,
                        descriptor: src_bitmap.descriptor
                    });
                    break;
                }

                default:
                    this.log_warn("FIXME: DrawCopy unhandled image type: " + src_bitmap.descriptor.type);
                    if (Utils.DEBUG > 1) this.log_draw("DrawCopy", draw_copy);
                    return false;
            }

            if (clipApplied && result !== undefined) {
                context.restore();
            }

            return result;
        }

        case Constants.SPICE_MSG_DISPLAY_DRAW_FILL: {
            const draw_fill = new Messages.SpiceMsgDisplayDrawFill(msg.data);
            if (Utils.DEBUG > 1) this.log_draw("DrawFill", draw_fill);

            if (draw_fill.data.rop_descriptor !== Constants.SPICE_ROPD_OP_PUT) {
                this.log_warn("FIXME: DrawFill we don't handle ropd type: " + draw_fill.data.rop_descriptor);
            }
            if (draw_fill.data.mask.flags) {
                this.log_warn("FIXME: DrawFill we don't handle mask flag: " + draw_fill.data.mask.flags);
            }
            if (draw_fill.data.mask.bitmap) {
                this.log_warn("FIXME: DrawFill we don't handle mask");
            }

            const canvas = this.surfaces[draw_fill.base.surface_id]?.canvas;
            if (!canvas) return false;
            const context = canvas.context;

            let clipApplied = false;
            if (draw_fill.base.clip.type === Constants.SPICE_CLIP_TYPE_RECTS && draw_fill.base.clip.rects && draw_fill.base.clip.rects.rects) {
                context.save();
                context.beginPath();
                const rects = draw_fill.base.clip.rects.rects;
                for (const rect of rects) {
                    context.rect(rect.left, rect.top, rect.right - rect.left, rect.bottom - rect.top);
                }
                context.clip();
                clipApplied = true;
            }

            if (draw_fill.data.brush.type === Constants.SPICE_BRUSH_TYPE_SOLID) {
                const color = draw_fill.data.brush.color & 0xffffff;
                const color_str = `rgb(${color >> 16}, ${(color >> 8) & 0xff}, ${color & 0xff})`;
                context.fillStyle = color_str;
                context.fillRect(
                    draw_fill.base.box.left, draw_fill.base.box.top,
                    draw_fill.base.box.right - draw_fill.base.box.left,
                    draw_fill.base.box.bottom - draw_fill.base.box.top
                );
                if (Utils.DUMP_DRAWS && this.parent.dump_id) {
                    const debug_canvas = document.createElement("canvas");
                    debug_canvas.width = this.surfaces[draw_fill.base.surface_id].canvas.width;
                    debug_canvas.height = this.surfaces[draw_fill.base.surface_id].canvas.height;
                    debug_canvas.id = `fillbrush.${draw_fill.base.surface_id}.${this.surfaces[draw_fill.base.surface_id].draw_count}`;
                    const debug_context = debug_canvas.getContext("2d");
                    debug_context.fillStyle = color_str;
                    debug_context.fillRect(
                        draw_fill.base.box.left, draw_fill.base.box.top,
                        draw_fill.base.box.right - draw_fill.base.box.left,
                        draw_fill.base.box.bottom - draw_fill.base.box.top
                    );
                    document.getElementById(this.parent.dump_id).appendChild(debug_canvas);
                }

                this.surfaces[draw_fill.base.surface_id].draw_count++;
            } else {
                this.log_warn("FIXME: DrawFill can't handle brush type: " + draw_fill.data.brush.type);
            }

            if (clipApplied) {
                context.restore();
            }

            return true;
        }

        case Constants.SPICE_MSG_DISPLAY_DRAW_OPAQUE:
        case Constants.SPICE_MSG_DISPLAY_DRAW_BLEND:
        case Constants.SPICE_MSG_DISPLAY_DRAW_BLACKNESS:
        case Constants.SPICE_MSG_DISPLAY_DRAW_WHITENESS:
        case Constants.SPICE_MSG_DISPLAY_DRAW_INVERS:
        case Constants.SPICE_MSG_DISPLAY_DRAW_ROP3:
        case Constants.SPICE_MSG_DISPLAY_DRAW_STROKE:
        case Constants.SPICE_MSG_DISPLAY_DRAW_TRANSPARENT:
        case Constants.SPICE_MSG_DISPLAY_DRAW_ALPHA_BLEND:
            this.known_unimplemented(msg.type, `Display ${msg.type}`);
            return true;

        case Constants.SPICE_MSG_DISPLAY_COPY_BITS: {
            const copy_bits = new Messages.SpiceMsgDisplayCopyBits(msg.data);
            if (Utils.DEBUG > 1) this.log_draw("CopyBits", copy_bits);

            const source_canvas = this.surfaces[copy_bits.base.surface_id]?.canvas;
            if (!source_canvas) return false;
            const source_context = source_canvas.context;

            let clipApplied = false;
            if (copy_bits.base.clip && copy_bits.base.clip.type === Constants.SPICE_CLIP_TYPE_RECTS && copy_bits.base.clip.rects && copy_bits.base.clip.rects.rects) {
                source_context.save();
                source_context.beginPath();
                const rects = copy_bits.base.clip.rects.rects;
                for (const rect of rects) {
                    source_context.rect(rect.left, rect.top, rect.right - rect.left, rect.bottom - rect.top);
                }
                source_context.clip();
                clipApplied = true;
            }

            const width = Math.min(
                source_canvas.width - copy_bits.src_pos.x,
                copy_bits.base.box.right - copy_bits.base.box.left
            );
            const height = Math.min(
                source_canvas.height - copy_bits.src_pos.y,
                copy_bits.base.box.bottom - copy_bits.base.box.top
            );
            const source_img = source_context.getImageData(copy_bits.src_pos.x, copy_bits.src_pos.y, width, height);
            putImageDataWithAlpha.call(this, source_context, source_img, copy_bits.base.box.left, copy_bits.base.box.top);
            if (Utils.DUMP_DRAWS && this.parent.dump_id) {
                const debug_canvas = document.createElement("canvas");
                debug_canvas.width = width;
                debug_canvas.height = height;
                debug_canvas.id = `copybits${copy_bits.base.surface_id}.${this.surfaces[copy_bits.base.surface_id].draw_count}`;
                debug_canvas.getContext("2d").putImageData(source_img, 0, 0);
                document.getElementById(this.parent.dump_id).appendChild(debug_canvas);
            }

            if (clipApplied) {
                source_context.restore();
            }

            this.surfaces[copy_bits.base.surface_id].draw_count++;
            return true;
        }

        case Constants.SPICE_MSG_DISPLAY_INVAL_ALL_PIXMAPS:
        case Constants.SPICE_MSG_DISPLAY_INVAL_PALETTE:
        case Constants.SPICE_MSG_DISPLAY_INVAL_ALL_PALETTES:
            this.known_unimplemented(msg.type, `Display ${msg.type}`);
            return true;

        case Constants.SPICE_MSG_DISPLAY_SURFACE_CREATE: {
            if (!this.surfaces) this.surfaces = [];
            const m = new Messages.SpiceMsgSurfaceCreate(msg.data);
            if (Utils.DEBUG > 1) {
                console.log(`${this.type}: MsgSurfaceCreate id ${m.surface.surface_id}; ${m.surface.width}x${m.surface.height}; format ${m.surface.format}; flags ${m.surface.flags}`);
            }

            if (m.surface.format !== Constants.SPICE_SURFACE_FMT_32_xRGB && m.surface.format !== Constants.SPICE_SURFACE_FMT_32_ARGB) {
                this.log_warn("FIXME: cannot handle surface format " + m.surface.format + " yet.");
                return false;
            }

            const canvas = document.createElement("canvas");
            canvas.width = m.surface.width;
            canvas.height = m.surface.height;
            canvas.id = `spice_surface_${m.surface.surface_id}`;
            canvas.tabIndex = m.surface.surface_id;
            canvas.context = canvas.getContext("2d");

            if (Utils.DUMP_CANVASES && this.parent.dump_id) {
                document.getElementById(this.parent.dump_id).appendChild(canvas);
            }

            m.surface.canvas = canvas;
            m.surface.draw_count = 0;
            this.surfaces[m.surface.surface_id] = m.surface;

            if (m.surface.flags & Constants.SPICE_SURFACE_FLAGS_PRIMARY) {
                this.primary_surface = m.surface.surface_id;
                canvas.context.save();
                document.getElementById(this.parent.screen_id).appendChild(canvas);
                document.getElementById(this.parent.screen_id).style.height = m.surface.height + "px";
                this.hook_events();
            }
            return true;
        }

        case Constants.SPICE_MSG_DISPLAY_SURFACE_DESTROY: {
            const m = new Messages.SpiceMsgSurfaceDestroy(msg.data);
            if (Utils.DEBUG > 1) console.log(`${this.type}: MsgSurfaceDestroy id ${m.surface_id}`);
            this.delete_surface(m.surface_id);
            return true;
        }

        case Constants.SPICE_MSG_DISPLAY_STREAM_CREATE: {
            const m = new Messages.SpiceMsgDisplayStreamCreate(msg.data);
            if (Utils.STREAM_DEBUG > 0) {
                console.log(`${this.type}: MsgStreamCreate id${m.id}; type ${m.codec_type}; width ${m.stream_width}; height ${m.stream_height}; left ${m.dest.left}; top ${m.dest.top}`);
            }

            if (!this.streams) this.streams = new Array();
            if (this.streams[m.id]) {
                console.log(`Stream ${m.id} already exists`);
            } else {
                this.streams[m.id] = m;
            }

            if (m.codec_type === Constants.SPICE_VIDEO_CODEC_TYPE_VP8) {
                const media = new MediaSource();
                const v = document.createElement("video");
                v.src = window.URL.createObjectURL(media);
                v.muted = true;
                v.autoplay = true;
                v.width = m.stream_width;
                v.height = m.stream_height;

                let left = m.dest.left;
                let top = m.dest.top;
                const surface = this.surfaces[m.surface_id];
                if (surface) {
                    left += surface.canvas.offsetLeft;
                    top += surface.canvas.offsetTop;
                }
                v.style.cssText = `pointer-events:none; position:absolute; top:${top}px; left:${left}px;`;
                document.getElementById(this.parent.screen_id).appendChild(v);

                media.addEventListener('sourceopen', handle_video_source_open, false);
                media.addEventListener('sourceended', handle_video_source_ended, false);
                media.addEventListener('sourceclosed', handle_video_source_closed, false);

                const s = this.streams[m.id];
                s.video = v;
                s.media = media;
                s.queue = [];
                s.start_time = 0;
                s.cluster_time = 0;
                s.append_okay = false;
                media.stream = s;
                media.spiceconn = this;
                v.spice_stream = s;
            } else if (m.codec_type === Constants.SPICE_VIDEO_CODEC_TYPE_MJPEG) {
                this.streams[m.id].frames_loading = 0;
            } else {
                console.log("Unhandled stream codec: " + m.codec_type);
            }
            return true;
        }

        case Constants.SPICE_MSG_DISPLAY_STREAM_DATA:
        case Constants.SPICE_MSG_DISPLAY_STREAM_DATA_SIZED: {
            const m = msg.type === Constants.SPICE_MSG_DISPLAY_STREAM_DATA_SIZED
                ? new Messages.SpiceMsgDisplayStreamDataSized(msg.data)
                : new Messages.SpiceMsgDisplayStreamData(msg.data);

            const stream = this.streams[m.base.id];
            if (!stream) {
                console.log("no stream for data");
                return false;
            }

            const time_until_due = m.base.multi_media_time - this.parent.relative_now();
            if (stream.codec_type === Constants.SPICE_VIDEO_CODEC_TYPE_MJPEG) {
                process_mjpeg_stream_data(this, m, time_until_due);
            } else if (stream.codec_type === Constants.SPICE_VIDEO_CODEC_TYPE_VP8) {
                process_video_stream_data(stream, m);
            }
            return true;
        }

        case Constants.SPICE_MSG_DISPLAY_STREAM_ACTIVATE_REPORT: {
            const m = new Messages.SpiceMsgDisplayStreamActivateReport(msg.data);
            const report = new Messages.SpiceMsgcDisplayStreamReport(m.stream_id, m.unique_id);
            const stream = this.streams[m.stream_id];
            if (stream) {
                stream.report = report;
                stream.max_window_size = m.max_window_size;
                stream.timeout_ms = m.timeout_ms;
            }
            return true;
        }

        case Constants.SPICE_MSG_DISPLAY_STREAM_CLIP: {
            const m = new Messages.SpiceMsgDisplayStreamClip(msg.data);
            if (Utils.STREAM_DEBUG > 1) console.log(`${this.type}: MsgStreamClip id${m.id}`);
            this.streams[m.id].clip = m.clip;
            return true;
        }

        case Constants.SPICE_MSG_DISPLAY_STREAM_DESTROY: {
            const m = new Messages.SpiceMsgDisplayStreamDestroy(msg.data);
            if (Utils.STREAM_DEBUG > 0) console.log(`${this.type}: MsgStreamDestroy id${m.id}`);
            const stream = this.streams[m.id];
            if (stream?.codec_type === Constants.SPICE_VIDEO_CODEC_TYPE_VP8) {
                document.getElementById(this.parent.screen_id).removeChild(stream.video);
                stream.source_buffer = null;
                stream.media = null;
                stream.video = null;
            }
            this.streams[m.id] = undefined;
            return true;
        }

        case Constants.SPICE_MSG_DISPLAY_STREAM_DESTROY_ALL:
            this.known_unimplemented(msg.type, "Display Stream Destroy All");
            return true;

        case Constants.SPICE_MSG_DISPLAY_INVAL_LIST: {
            const m = new Messages.SpiceMsgDisplayInvalList(msg.data);
            if (Utils.DEBUG > 1) console.log(`${this.type}: MsgInvalList ${m.count} items`);
            for (let i = 0; i < m.count; i++) {
                if (this.cache?.[m.resources[i].id] !== undefined) {
                    delete this.cache[m.resources[i].id];
                }
            }
            return true;
        }

        case Constants.SPICE_MSG_DISPLAY_MONITORS_CONFIG:
        case Constants.SPICE_MSG_DISPLAY_DRAW_COMPOSITE:
            this.known_unimplemented(msg.type, `Display ${msg.type}`);
            return true;

        default:
            return false;
    }
}

SpiceDisplayConn.prototype.delete_surface = function(surface_id) {
    const canvas = document.getElementById(`spice_surface_${surface_id}`);
    if (Utils.DUMP_CANVASES && this.parent.dump_id) {
        document.getElementById(this.parent.dump_id).removeChild(canvas);
    }
    if (this.primary_surface === surface_id) {
        this.unhook_events();
        this.primary_surface = undefined;
        document.getElementById(this.parent.screen_id).removeChild(canvas);
    }
    delete this.surfaces[surface_id];
}

SpiceDisplayConn.prototype.draw_copy_helper = async function(o) {
    const canvas = this.surfaces[o.base.surface_id]?.canvas;
    if (!canvas) return false;
    const context = canvas.context;

    const pendingPromises = [];
    if (this.pendingImages) {
        for (const [id, promise] of this.pendingImages) {
            if (id.startsWith(`jpeg`) || (o.descriptor?.id && id === `cache.${o.descriptor.id}`)) {
                pendingPromises.push(promise);
            }
        }
    }
    if (pendingPromises.length > 0) {
        await Promise.all(pendingPromises);
    }

    if (o.has_alpha) {
        if (this.surfaces[o.base.surface_id].format === Constants.SPICE_SURFACE_FMT_32_xRGB) {
            stripAlpha(o.image_data);
            context.putImageData(o.image_data, o.base.box.left, o.base.box.top);
        } else {
            putImageDataWithAlpha.call(this, context, o.image_data, o.base.box.left, o.base.box.top);
        }
    } else {
        context.putImageData(o.image_data, o.base.box.left, o.base.box.top);
    }

    if (o.src_area.left > 0 || o.src_area.top > 0) {
        this.log_warn("FIXME: DrawCopy not shifting draw copies just yet...");
    }

    if (o.descriptor?.flags & Constants.SPICE_IMAGE_FLAGS_CACHE_ME) {
        this.cache = this.cache || {};
        this.cache[o.descriptor.id] = o.image_data;
    }
    if (Utils.DUMP_DRAWS || Utils.DUMP_DRAW_COPY) {
        if (!this.debugWindow || this.debugWindow.closed) {
            this.debugWindow = window.open('', 'SpiceDebugWindow', 'width=800,height=600,scrollbars=yes');
            this.debugWindow.document.title = 'Spice Debug Canvases';
            this.debugWindow.document.body.style.cssText = 'margin: 10px; background: #f0f0f0;';

            const container = this.debugWindow.document.createElement('div');
            container.id = 'debug-container';
            container.style.cssText = 'display: flex; flex-wrap: wrap; gap: 10px;';
            this.debugWindow.document.body.appendChild(container);

            const clearButton = this.debugWindow.document.createElement('button');
            clearButton.textContent = 'Clear Page';
            clearButton.style.cssText = 'padding: 8px 16px; margin-top: 10px; cursor: pointer; display: block; width: 100%; text-align: center;';
            clearButton.addEventListener('click', () => {
                const container = this.debugWindow.document.getElementById('debug-container');
                while (container.firstChild) {
                    container.removeChild(container.firstChild);
                }
            });
            this.debugWindow.document.body.appendChild(clearButton);
        }

        const wrapper = document.createElement("div");
        wrapper.style.cssText = 'display: flex; flex-direction: column; align-items: center;';

        const caption = document.createElement("span");
        caption.textContent = o.tag;
        caption.style.cssText = 'font-size: 12px; text-align: center; margin-bottom: 5px;';

        const debug_canvas = document.createElement("canvas");
        debug_canvas.width = o.image_data.width;
        debug_canvas.height = o.image_data.height;
        debug_canvas.id = `${o.tag}.${this.surfaces[o.base.surface_id].draw_count}.${o.base.surface_id}@${o.base.box.left}x${o.base.box.top}`;
        debug_canvas.style.cssText = `border: 1px solid black; cursor: pointer; width: ${o.image_data.width}px; height: ${o.image_data.height}px; object-fit: none;`;
        debug_canvas.getContext("2d").putImageData(o.image_data, 0, 0);
        debug_canvas.addEventListener('click', () => {
            console.log(o);
        });

        wrapper.appendChild(caption);
        wrapper.appendChild(debug_canvas);
        this.debugWindow.document.getElementById('debug-container').appendChild(wrapper);

        this.debugWindow.scrollTo({
            top: this.debugWindow.document.body.scrollHeight,
            behavior: 'smooth'
        });
    }

    this.surfaces[o.base.surface_id].draw_count++;
    return true;
}

SpiceDisplayConn.prototype.log_draw = function(prefix, draw) {
    if (Utils.DEBUG <= 1) return;
    let str = `${prefix}.${draw.base.surface_id}.${this.surfaces[draw.base.surface_id].draw_count}: `;
    str += `base.box ${draw.base.box.left}, ${draw.base.box.top} to ${draw.base.box.right}, ${draw.base.box.bottom}`;
    str += `; clip.type ${draw.base.clip.type}`;

    if (draw.data) {
        if (draw.data.src_area) {
            str += `; src_area ${draw.data.src_area.left}, ${draw.data.src_area.top} to ${draw.data.src_area.right}, ${draw.data.src_area.bottom}`;
        }
        if (draw.data.src_bitmap) {
            const bitmap = draw.data.src_bitmap;
            str += `; src_bitmap id: ${bitmap.descriptor.id}`;
            str += `; src_bitmap width ${bitmap.descriptor.width}, height ${bitmap.descriptor.height}`;
            str += `; src_bitmap type ${bitmap.descriptor.type}, flags ${bitmap.descriptor.flags}`;
            if (bitmap.surface_id !== undefined) {
                str += `; src_bitmap surface_id ${bitmap.surface_id}`;
            }
            if (bitmap.bitmap) {
                str += `; BITMAP format ${bitmap.bitmap.format}; flags ${bitmap.bitmap.flags}; x ${bitmap.bitmap.x}; y ${bitmap.bitmap.y}; stride ${bitmap.bitmap.stride}`;
            }
            if (bitmap.quic) {
                str += `; QUIC type ${bitmap.quic.type}; width ${bitmap.quic.width}; height ${bitmap.quic.height}`;
            }
            if (bitmap.lz_rgb) {
                str += `; LZ_RGB length ${bitmap.lz_rgb.length}; magic ${bitmap.lz_rgb.magic}; version 0x${bitmap.lz_rgb.version.toString(16)}`;
                str += `; type ${bitmap.lz_rgb.type}; width ${bitmap.lz_rgb.width}; height ${bitmap.lz_rgb.height}; stride ${bitmap.lz_rgb.stride}; top down ${bitmap.lz_rgb.top_down}`;
            }
        } else {
            str += "; src_bitmap is null";
        }
        if (draw.data.brush) {
            if (draw.data.brush.type === Constants.SPICE_BRUSH_TYPE_SOLID) {
                str += `; brush.color 0x${draw.data.brush.color.toString(16)}`;
            } else if (draw.data.brush.type === Constants.SPICE_BRUSH_TYPE_PATTERN) {
                str += `; brush.pat ${draw.data.brush.pattern.pat ? "[SpiceImage]" : "[null]"}`;
                str += ` at ${draw.data.brush.pattern.pos.x}, ${draw.data.brush.pattern.pos.y}`;
            }
        }
        str += `; rop_descriptor ${draw.data.rop_descriptor}`;
        if (draw.data.scale_mode !== undefined) {
            str += `; scale_mode ${draw.data.scale_mode}`;
        }
        str += `; mask.flags ${draw.data.mask.flags}`;
        str += `; mask.pos ${draw.data.mask.pos.x}, ${draw.data.mask.pos.y}`;
        str += draw.data.mask.bitmap
            ? `; mask.bitmap width ${draw.data.mask.bitmap.descriptor.width}, height ${draw.data.mask.bitmap.descriptor.height}; type ${draw.data.mask.bitmap.descriptor.type}, flags ${draw.data.mask.bitmap.descriptor.flags}`
            : "; mask.bitmap is null";
    }
    console.log(str);
}

SpiceDisplayConn.prototype.hook_events = function() {
    const canvas = this.surfaces[this.primary_surface]?.canvas;
    if (!canvas) return;

    canvas.sc = this.parent;
    const events = [
        ['mousemove', Inputs.handle_mousemove],
        ['mousedown', Inputs.handle_mousedown],
        ['contextmenu', Inputs.handle_contextmenu],
        ['mouseup', Inputs.handle_mouseup],
        ['keydown', Inputs.handle_keydown],
        ['keyup', Inputs.handle_keyup],
        ['mouseout', handle_mouseout],
        ['mouseover', handle_mouseover],
        ['wheel', Inputs.handle_mousewheel]
    ];
    events.forEach(([event, handler]) => canvas.addEventListener(event, handler));
    canvas.focus();
}

SpiceDisplayConn.prototype.unhook_events = function() {
    const canvas = this.surfaces[this.primary_surface]?.canvas;
    if (!canvas) return;

    const events = [
        ['mousemove', Inputs.handle_mousemove],
        ['mousedown', Inputs.handle_mousedown],
        ['contextmenu', Inputs.handle_contextmenu],
        ['mouseup', Inputs.handle_mouseup],
        ['keydown', Inputs.handle_keydown],
        ['keyup', Inputs.handle_keyup],
        ['mouseout', handle_mouseout],
        ['mouseover', handle_mouseover],
        ['wheel', Inputs.handle_mousewheel]
    ];
    events.forEach(([event, handler]) => canvas.removeEventListener(event, handler));
}

SpiceDisplayConn.prototype.destroy_surfaces = function() {
    if (this.surfaces) {
        Object.keys(this.surfaces).forEach(s => this.delete_surface(this.surfaces[s].surface_id));
        this.surfaces = undefined;
    }
}

function handle_mouseover(e) {
    this.focus();
}

function handle_mouseout(e) {
    if (this.sc?.cursor?.spice_simulated_cursor) {
        this.sc.cursor.spice_simulated_cursor.style.display = 'none';
    }
    this.blur();
}

function handle_draw_jpeg_onload() {
    const sc = this.o.sc;
    const surface = sc.surfaces[this.o.base.surface_id];
    let context, temp_canvas;

    if (sc.streams?.[this.o.id]) {
        sc.streams[this.o.id].frames_loading--;
    }

    if (!surface) {
        if (Utils.DEBUG > 2) sc.log_info("Discarding jpeg; presumed lost surface " + this.o.base.surface_id);
        temp_canvas = document.createElement("canvas");
        temp_canvas.width = this.o.base.box.right;
        temp_canvas.height = this.o.base.box.bottom;
        context = temp_canvas.getContext("2d");
    } else {
        context = surface.canvas.context;
    }

    let clipApplied = false;
    if (this.o.clip && this.o.clip.type === Constants.SPICE_CLIP_TYPE_RECTS && this.o.clip.rects && this.o.clip.rects.rects) {
        context.save();
        context.beginPath();
        const rects = this.o.clip.rects.rects;
        for (const rect of rects) {
            context.rect(rect.left, rect.top, rect.right - rect.left, rect.bottom - rect.top);
        }
        context.clip();
        clipApplied = true;
    }

    const width = this.width;
    const height = this.height;
    const needsFlipping = this.o.flip;

    const offscreenCanvas = new OffscreenCanvas(width, height);
    const offscreenCtx = offscreenCanvas.getContext("2d");

    if (needsFlipping) {
        offscreenCtx.save();
        offscreenCtx.translate(0, height);
        offscreenCtx.scale(1, -1);
        offscreenCtx.drawImage(this, 0, 0, width, height);
        offscreenCtx.restore();
    } else {
        offscreenCtx.drawImage(this, 0, 0, width, height);
    }

    if (this.alpha_img) {
        const c = document.createElement("canvas");
        c.width = this.alpha_img.width;
        c.height = this.alpha_img.height;
        const t = c.getContext("2d");
        t.putImageData(this.alpha_img, 0, 0);
        t.globalCompositeOperation = 'source-in';
        t.drawImage(offscreenCanvas, 0, 0);
        context.drawImage(c, this.o.base.box.left, this.o.base.box.top);

        if (this.o.descriptor?.flags & Constants.SPICE_IMAGE_FLAGS_CACHE_ME) {
            sc.cache = sc.cache || {};
            sc.cache[this.o.descriptor.id] = t.getImageData(0, 0, this.alpha_img.width, this.alpha_img.height);
        }
    } else {
        context.drawImage(offscreenCanvas, this.o.base.box.left, this.o.base.box.top);
        this.onload = undefined;
        this.src = Utils.EMPTY_GIF_IMAGE;

        if (this.o.descriptor?.flags & Constants.SPICE_IMAGE_FLAGS_CACHE_ME) {
            sc.cache = sc.cache || {};
            sc.cache[this.o.descriptor.id] = context.getImageData(
                this.o.base.box.left, this.o.base.box.top,
                this.o.base.box.right - this.o.base.box.left,
                this.o.base.box.bottom - this.o.base.box.top
            );
        }
    }

    if (clipApplied) {
        context.restore();
    }

    if (!temp_canvas && (Utils.DUMP_DRAWS || Utils.DUMP_JPEG)) {
        if (!sc.debugWindow || sc.debugWindow.closed) {
            sc.debugWindow = window.open('', 'SpiceDebugWindow', 'width=800,height=600,scrollbars=yes');
            sc.debugWindow.document.title = 'Spice Debug Canvases';
            sc.debugWindow.document.body.style.cssText = 'margin: 10px; background: #f0f0f0;';

            const container = sc.debugWindow.document.createElement('div');
            container.id = 'debug-container';
            container.style.cssText = 'display: flex; flex-wrap: wrap; gap: 10px;';
            sc.debugWindow.document.body.appendChild(container);

            const clearButton = sc.debugWindow.document.createElement('button');
            clearButton.textContent = 'Clear Page';
            clearButton.style.cssText = 'padding: 8px 16px; margin-top: 10px; cursor: pointer; display: block; width: 100%; text-align: center;';
            clearButton.addEventListener('click', () => {
                const container = sc.debugWindow.document.getElementById('debug-container');
                while (container.firstChild) {
                    container.removeChild(container.firstChild);
                }
            });
            sc.debugWindow.document.body.appendChild(clearButton);
        }

        const wrapper = document.createElement("div");
        wrapper.style.cssText = 'display: flex; flex-direction: column; align-items: center;';

        const caption = document.createElement("span");
        caption.textContent = this.o.tag;
        caption.style.cssText = 'font-size: 12px; text-align: center; margin-bottom: 5px;';

        const debug_canvas = document.createElement("canvas");
        debug_canvas.width = width;
        debug_canvas.height = height;
        debug_canvas.id = `${this.o.tag}@${this.o.base.box.left}x${this.o.base.box.top}`;
        debug_canvas.style.cssText = `border: 1px solid black; cursor: pointer; width: ${width}px; height: ${height}px; object-fit: none;`;
        debug_canvas.getContext("2d").drawImage(offscreenCanvas, 0, 0);
        debug_canvas.addEventListener('click', () => {
            console.log(this.o);
        });

        wrapper.appendChild(caption);
        wrapper.appendChild(debug_canvas);
        sc.debugWindow.document.getElementById('debug-container').appendChild(wrapper);

        sc.debugWindow.scrollTo({
            top: sc.debugWindow.document.body.scrollHeight,
            behavior: 'smooth'
        });
    }

    if (!temp_canvas) {
        sc.surfaces[this.o.base.surface_id].draw_count++;
    }

    if (sc.streams?.[this.o.id]?.report) {
        process_stream_data_report(sc, this.o.id, this.o.msg_mmtime, this.o.msg_mmtime - sc.parent.relative_now());
    }

    if (this.src.startsWith('blob:')) {
        URL.revokeObjectURL(this.src);
    }
    this.o.sc.pendingImages.delete(`jpeg.${this.o.base.surface_id}`);
}

function process_mjpeg_stream_data(sc, m, time_until_due) {
    const stream = sc.streams[m.base.id];
    if (time_until_due < 0 && stream.frames_loading > 0) {
        if (stream.report) stream.report.num_drops++;
        return;
    }

    const blob = new Blob([new Uint8Array(m.data)], { type: "image/jpeg" });
    const img = new Image();
    const strm_base = new Messages.SpiceMsgDisplayBase();
    strm_base.surface_id = stream.surface_id;
    strm_base.box = m.dest || stream.dest;
    strm_base.clip = stream.clip;
    const shouldFlip = !stream.flags & 1; // 1 -- TOPDOWN FLAG
    img.o = {
        base: strm_base,
        tag: `mjpeg.${m.base.id}`,
        descriptor: null,
        sc: sc,
        id: m.base.id,
        msg_mmtime: m.base.multi_media_time,
        flip: shouldFlip,
        clip: strm_base.clip // Include clip information for MJPEG streams
    };
    img.onload = function() {
        handle_draw_jpeg_onload.call(this);
        URL.revokeObjectURL(this.src); // Clean up Blob URL
    };
    img.onerror = () => {
        sc.log_err("Error loading MJPEG frame");
        stream.frames_loading--;
    };
    img.src = URL.createObjectURL(blob);
    stream.frames_loading++;
}

function process_stream_data_report(sc, id, msg_mmtime, time_until_due) {
    const stream = sc.streams[id];
    stream.report.num_frames++;
    if (stream.report.start_frame_mm_time === 0) {
        stream.report.start_frame_mm_time = msg_mmtime;
    }

    if (stream.report.num_frames > stream.max_window_size || (msg_mmtime - stream.report.start_frame_mm_time) > stream.timeout_ms) {
        stream.report.end_frame_mm_time = msg_mmtime;
        stream.report.last_frame_delay = time_until_due;
        const msg = new Messages.SpiceMiniData();
        msg.build_msg(Constants.SPICE_MSGC_DISPLAY_STREAM_REPORT, stream.report);
        sc.send_msg(msg);
        stream.report.start_frame_mm_time = 0;
        stream.report.num_frames = 0;
        stream.report.num_drops = 0;
    }
}

function handle_video_source_open(e) {
    const stream = this.stream;
    const p = this.spiceconn;

    if (stream.source_buffer) return;

    const s = this.addSourceBuffer(Webm.Constants.SPICE_VP8_CODEC);
    if (!s) {
        p.log_err('Codec ' + Webm.Constants.SPICE_VP8_CODEC + ' not available.');
        return;
    }

    stream.source_buffer = s;
    s.spiceconn = p;
    s.stream = stream;
    listen_for_video_events(stream);

    const h = new Webm.Header();
    const te = new Webm.VideoTrackEntry(stream.stream_width, stream.stream_height);
    const t = new Webm.Tracks(te);
    const mb = new ArrayBuffer(h.buffer_size() + t.buffer_size());
    const b = h.to_buffer(mb);
    t.to_buffer(mb, b);

    s.addEventListener('error', handle_video_buffer_error, false);
    s.addEventListener('updateend', handle_append_video_buffer_done, false);
    append_video_buffer(s, mb);
}

function handle_video_source_ended(e) {
    this.spiceconn.log_err('Video source unexpectedly ended.');
}

function handle_video_source_closed(e) {
    this.spiceconn.log_err('Video source unexpectedly closed.');
}

function append_video_buffer(sb, mb) {
    try {
        sb.stream.append_okay = false;
        sb.appendBuffer(mb);
    } catch (e) {
        sb.spiceconn.log_err("Error invoking appendBuffer: " + e.message);
    }
}

function handle_append_video_buffer_done(e) {
    const stream = this.stream;

    if (stream.current_frame?.report) {
        const sc = stream.media.spiceconn;
        const t = stream.current_frame.msg_mmtime;
        process_stream_data_report(sc, stream.id, t, t - sc.parent.relative_now());
    }

    if (stream.queue.length > 0) {
        stream.current_frame = stream.queue.shift();
        append_video_buffer(stream.source_buffer, stream.current_frame.mb);
    } else {
        stream.append_okay = true;
    }

    if (!stream.video) {
        if (Utils.STREAM_DEBUG > 0) console.log(`Stream id ${stream.id} received updateend after video is gone.`);
        return;
    }

    if (stream.video.buffered.length > 0 && stream.video.currentTime < stream.video.buffered.start(stream.video.buffered.length - 1)) {
        console.log(`Video appears to have fallen behind; advancing to ${stream.video.buffered.start(stream.video.buffered.length - 1)}`);
        stream.video.currentTime = stream.video.buffered.start(stream.video.buffered.length - 1);
    }

    if (stream.video.paused && stream.video.readyState >= 2) {
        stream.video.play();
    }

    if (Utils.STREAM_DEBUG > 1) {
        console.log(`${stream.video.currentTime}:id ${stream.id} updateend ${Utils.dump_media_element(stream.video)}`);
    }
}

function handle_video_buffer_error(e) {
    this.spiceconn.log_err('source_buffer error ' + e.message);
}

function push_or_queue(stream, msg, mb) {
    const frame = { msg_mmtime: msg.base.multi_media_time };
    if (stream.append_okay) {
        stream.current_frame = frame;
        append_video_buffer(stream.source_buffer, mb);
    } else {
        frame.mb = mb;
        stream.queue.push(frame);
    }
}

function video_simple_block(stream, msg, keyframe) {
    const simple = new Webm.SimpleBlock(msg.base.multi_media_time - stream.cluster_time, msg.data, keyframe);
    const mb = new ArrayBuffer(simple.buffer_size());
    simple.to_buffer(mb);
    push_or_queue(stream, msg, mb);
}

function new_video_cluster(stream, msg) {
    stream.cluster_time = msg.base.multi_media_time;
    const c = new Webm.Cluster(stream.cluster_time - stream.start_time, msg.data);
    const mb = new ArrayBuffer(c.buffer_size());
    c.to_buffer(mb);
    push_or_queue(stream, msg, mb);
    video_simple_block(stream, msg, true);
}

function process_video_stream_data(stream, msg) {
    if (stream.start_time === 0) {
        stream.start_time = msg.base.multi_media_time;
        new_video_cluster(stream, msg);
    } else if (msg.base.multi_media_time - stream.cluster_time >= Webm.Constants.MAX_CLUSTER_TIME) {
        new_video_cluster(stream, msg);
    } else {
        video_simple_block(stream, msg, false);
    }
}

function video_handle_event_debug(e) {
    const s = this.spice_stream;
    if (!s.video) return;
    if (Utils.STREAM_DEBUG > 0 || s.video.buffered.length > 1) {
        console.log(`${s.video.currentTime}:id ${s.id} event ${e.type}${Utils.dump_media_element(s.video)}`);
    }
    if (Utils.STREAM_DEBUG > 1 && s.media) {
        console.log(`  media_source ${Utils.dump_media_source(s.media)}`);
    }
    if (Utils.STREAM_DEBUG > 1 && s.source_buffer) {
        console.log(`  source_buffer ${Utils.dump_source_buffer(s.source_buffer)}`);
    }
    if (Utils.STREAM_DEBUG > 1 || s.queue.length > 1) {
        console.log(`  queue len ${s.queue.length}; append_okay: ${s.append_okay}`);
    }
}

function video_debug_listen_for_one_event(name) {
    this.addEventListener(name, video_handle_event_debug);
}

function listen_for_video_events(stream) {
    const video_0_events = ["abort", "error"];
    const video_1_events = [
        "loadstart", "suspend", "emptied", "stalled", "loadedmetadata", "loadeddata", "canplay",
        "canplaythrough", "playing", "waiting", "seeking", "seeked", "ended", "durationchange",
        "play", "pause", "ratechange"
    ];
    const video_2_events = ["timeupdate", "progress", "resize", "volumechange"];

    video_0_events.forEach(video_debug_listen_for_one_event, stream.video);
    if (Utils.STREAM_DEBUG > 0) video_1_events.forEach(video_debug_listen_for_one_event, stream.video);
    if (Utils.STREAM_DEBUG > 1) video_2_events.forEach(video_debug_listen_for_one_event, stream.video);
}

export { SpiceDisplayConn };