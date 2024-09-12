"use strict";
/*
   Copyright (C) 2014 by Jeremy P. White <jwhite@codeweavers.com>

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
**  EBML identifiers
**--------------------------------------------------------------------------*/
var EBML_HEADER =                           [ 0x1a, 0x45, 0xdf, 0xa3 ];
var EBML_HEADER_VERSION =                   [ 0x42, 0x86 ];
var EBML_HEADER_READ_VERSION =              [ 0x42, 0xf7 ];
var EBML_HEADER_MAX_ID_LENGTH =             [ 0x42, 0xf2 ];
var EBML_HEADER_MAX_SIZE_LENGTH =           [ 0x42, 0xf3 ];
var EBML_HEADER_DOC_TYPE =                  [ 0x42, 0x82 ];
var EBML_HEADER_DOC_TYPE_VERSION =          [ 0x42, 0x87 ];
var EBML_HEADER_DOC_TYPE_READ_VERSION =     [ 0x42, 0x85 ];

var WEBM_SEGMENT_HEADER =                   [ 0x18, 0x53, 0x80, 0x67 ];
var WEBM_SEGMENT_INFORMATION =              [ 0x15, 0x49, 0xA9, 0x66 ];

var WEBM_TIMECODE_SCALE =                   [ 0x2A, 0xD7, 0xB1 ];
var WEBM_MUXING_APP =                       [ 0x4D, 0x80 ];
var WEBM_WRITING_APP =                      [ 0x57, 0x41 ];

var WEBM_SEEK_HEAD =                        [ 0x11, 0x4D, 0x9B, 0x74 ];
var WEBM_SEEK =                             [ 0x4D, 0xBB ];
var WEBM_SEEK_ID =                          [ 0x53, 0xAB ];
var WEBM_SEEK_POSITION =                    [ 0x53, 0xAC ];

var WEBM_TRACKS =                           [ 0x16, 0x54, 0xAE, 0x6B ];
var WEBM_TRACK_ENTRY =                      [ 0xAE ];
var WEBM_TRACK_NUMBER =                     [ 0xD7 ];
var WEBM_TRACK_UID =                        [ 0x73, 0xC5 ];
var WEBM_TRACK_TYPE =                       [ 0x83 ];
var WEBM_FLAG_ENABLED =                     [ 0xB9 ];
var WEBM_FLAG_DEFAULT =                     [ 0x88 ];
var WEBM_FLAG_FORCED =                      [ 0x55, 0xAA ];
var WEBM_FLAG_LACING =                      [ 0x9C ];
var WEBM_MIN_CACHE =                        [ 0x6D, 0xE7 ];

var WEBM_MAX_BLOCK_ADDITION_ID =            [ 0x55, 0xEE ];
var WEBM_CODEC_DECODE_ALL =                 [ 0xAA ];
var WEBM_SEEK_PRE_ROLL =                    [ 0x56, 0xBB ];
var WEBM_CODEC_DELAY =                      [ 0x56, 0xAA ];
var WEBM_CODEC_PRIVATE =                    [ 0x63, 0xA2 ];
var WEBM_CODEC_ID =                         [ 0x86 ];

var WEBM_VIDEO =                            [ 0xE0 ] ;
var WEBM_FLAG_INTERLACED =                  [ 0x9A ] ;
var WEBM_PIXEL_WIDTH =                      [ 0xB0 ] ;
var WEBM_PIXEL_HEIGHT =                     [ 0xBA ] ;

var WEBM_AUDIO =                            [ 0xE1 ] ;
var WEBM_SAMPLING_FREQUENCY =               [ 0xB5 ] ;
var WEBM_CHANNELS =                         [ 0x9F ] ;

var WEBM_CLUSTER =                          [ 0x1F, 0x43, 0xB6, 0x75 ];
var WEBM_TIME_CODE =                        [ 0xE7 ] ;
var WEBM_SIMPLE_BLOCK =                     [ 0xA3 ] ;

/*----------------------------------------------------------------------------
**  Various OPUS / Webm constants
**--------------------------------------------------------------------------*/
var Constants = {
  CLUSTER_SIMPLEBLOCK_FLAG_KEYFRAME       : 1 << 7,

  OPUS_FREQUENCY                          : 48000,
  OPUS_CHANNELS                           : 2,

  SPICE_PLAYBACK_CODEC                    : 'audio/webm; codecs="opus"',
  MAX_CLUSTER_TIME                        : 1000,

  EXPECTED_PACKET_DURATION                : 10,
  GAP_DETECTION_THRESHOLD                 : 50,

  SPICE_VP8_CODEC                         : 'video/webm; codecs="vp8"',
};

/*----------------------------------------------------------------------------
**  EBML utility functions
**      These classes can create the binary representation of a webm file
**--------------------------------------------------------------------------*/
function EBML_write_u1_data_len(len, dv, at)
{
    var b = 0x80 | len;
    dv.setUint8(at, b);
    return at + 1;
}

function EBML_write_u8_value(id, val, dv, at)
{
    at = EBML_write_array(id, dv, at);
    at = EBML_write_u1_data_len(1, dv, at);
    dv.setUint8(at, val);
    return at + 1;
}

function EBML_write_u32_value(id, val, dv, at)
{
    at = EBML_write_array(id, dv, at);
    at = EBML_write_u1_data_len(4, dv, at);
    dv.setUint32(at, val);
    return at + 4;
}

function EBML_write_u16_value(id, val, dv, at)
{
    at = EBML_write_array(id, dv, at);
    at = EBML_write_u1_data_len(2, dv, at);
    dv.setUint16(at, val);
    return at + 2;
}

function EBML_write_float_value(id, val, dv, at)
{
    at = EBML_write_array(id, dv, at);
    at = EBML_write_u1_data_len(4, dv, at);
    dv.setFloat32(at, val);
    return at + 4;
}



function EBML_write_u64_data_len(len, dv, at) {
    const fixedBytes = [0x01, 0x00, 0x00, 0x00];
    
    for (let i = 0; i < fixedBytes.length; i++) {
        dv.setUint8(at++, fixedBytes[i]);
    }

    dv.setUint8(at++, (len >>> 24) & 0xFF);
    dv.setUint8(at++, (len >>> 16) & 0xFF);
    dv.setUint8(at++, (len >>> 8) & 0xFF);
    dv.setUint8(at++, len & 0xFF);
    
    return at;
}

function EBML_write_array(arr, dv, at) {
    dv.setUint8(at, ...arr);
    return at + arr.length;
}

function EBML_write_string(str, dv, at) {
    const len = str.length;
    for (let i = 0; i < len; i++) {
        dv.setUint8(at++, str.charCodeAt(i));
    }
    return at;
}

function EBML_write_data(id, data, dv, at) {
    at = EBML_write_array(id, dv, at);

    const dataLength = data.length;
    at = (dataLength < 127)
        ? EBML_write_u1_data_len(dataLength, dv, at)
        : EBML_write_u64_data_len(dataLength, dv, at);

    if (typeof data === "string") {
        return EBML_write_string(data, dv, at);
    } else {
        return EBML_write_array(data, dv, at);
    }
}

/*----------------------------------------------------------------------------
**  Webm objects
**      These classes can create the binary representation of a webm file
**--------------------------------------------------------------------------*/
function EBMLHeader() {
    this.id = EBML_HEADER;
    this.version = 1;
    this.readVersion = 1;
    this.maxIDLength = 4;
    this.maxSizeLength = 8;
    this.docType = "webm";
    this.docTypeVersion = 2; // Required for Firefox
    this.docTypeReadVersion = 2;
}

EBMLHeader.prototype = {
    toBuffer: function(buffer, offset = 0) {
        const dv = new DataView(buffer);

        const writeHelper = (fn, ...args) => offset = fn(...args, dv, offset);

        writeHelper(EBML_write_array, this.id);
        writeHelper(EBML_write_u64_data_len, 0x1f);
        writeHelper(EBML_write_u8_value, EBML_HEADER_VERSION, this.version);
        writeHelper(EBML_write_u8_value, EBML_HEADER_READ_VERSION, this.readVersion);
        writeHelper(EBML_write_u8_value, EBML_HEADER_MAX_ID_LENGTH, this.maxIDLength);
        writeHelper(EBML_write_u8_value, EBML_HEADER_MAX_SIZE_LENGTH, this.maxSizeLength);
        writeHelper(EBML_write_data, EBML_HEADER_DOC_TYPE, this.docType);
        writeHelper(EBML_write_u8_value, EBML_HEADER_DOC_TYPE_VERSION, this.docTypeVersion);
        writeHelper(EBML_write_u8_value, EBML_HEADER_DOC_TYPE_READ_VERSION, this.docTypeReadVersion);

        return offset;
    },
    bufferSize: function() {
        const headerLength = this.id.length;
        const fixedSize = 0x1f + 8;
        return fixedSize + headerLength;
    }
};

function webm_Segment() {
    this.id = WEBM_SEGMENT_HEADER;
}

webm_Segment.prototype = {
    to_buffer: function(a, at = 0) {
        const dv = new DataView(a);

        at = EBML_write_array(this.id, dv, at);
        dv.setUint8(at, 0xff);
        return at + 1;
    },

    buffer_size: function() {
        const idLength = this.id.length;
        return idLength + 1;
    },
};

function webm_SegmentInformation() {
    this.id = WEBM_SEGMENT_INFORMATION;
    this.timecode_scale = 1000000; // 1 ms
    this.muxing_app = "spice";
    this.writing_app = "spice-html5";

    this.idLength = this.id.length;
    this.muxingAppLength = this.muxing_app.length;
    this.writingAppLength = this.writing_app.length;
    
    this.bufferSize = this.idLength + 8 +
                      WEBM_TIMECODE_SCALE.length + 1 + 4 +
                      WEBM_MUXING_APP.length + 1 + this.muxingAppLength +
                      WEBM_WRITING_APP.length + 1 + this.writingAppLength;
}

webm_SegmentInformation.prototype = {
    to_buffer: function(a, at = 0) {
        let dv;
        if (!(a instanceof DataView)) {
            dv = new DataView(a);
        } else {
            dv = a;
        }

        at = EBML_write_array(this.id, dv, at);
        at = EBML_write_u64_data_len(this.bufferSize - 8 - this.idLength, dv, at);
        at = EBML_write_u32_value(WEBM_TIMECODE_SCALE, this.timecode_scale, dv, at);
        at = EBML_write_data(WEBM_MUXING_APP, this.muxing_app, dv, at);
        at = EBML_write_data(WEBM_WRITING_APP, this.writing_app, dv, at);
        
        return at;
    },
    buffer_size: function() {
        return this.bufferSize;
    }
};

function webm_Audio(frequency)
{
    this.id = WEBM_AUDIO;
    this.sampling_frequency = frequency;
    this.channels = Constants.OPUS_CHANNELS;
}

webm_Audio.prototype =
{
    to_buffer: function(a, at)
    {
        at = at || 0;
        var dv = new DataView(a);
        at = EBML_write_array(this.id, dv, at);
        at = EBML_write_u64_data_len(this.buffer_size() - 8 - this.id.length, dv, at);
        at = EBML_write_u8_value(WEBM_CHANNELS, this.channels, dv, at);
        at = EBML_write_float_value(WEBM_SAMPLING_FREQUENCY, this.sampling_frequency, dv, at);
        return at;
    },
    buffer_size: function()
    {
        return this.id.length + 8 +
            WEBM_SAMPLING_FREQUENCY.length + 1 + 4 +
            WEBM_CHANNELS.length + 1 + 1;
    },
}

function webm_Video(width, height) {
    this.id = WEBM_VIDEO;
    this.flag_interlaced = 0;
    this.width = width;
    this.height = height;
    this.idLength = this.id.length;
    this.initializeBufferSize();
}

webm_Video.prototype = {
    initializeBufferSize: function() {
        const FLAG_INTERLACED_LEN = 1;
        const WIDTH_DATA_LEN = 2;
        const HEIGHT_DATA_LEN = 2;

        this.constantBufferSize = this.idLength + 8 +
            WEBM_FLAG_INTERLACED.length + FLAG_INTERLACED_LEN +
            WEBM_PIXEL_WIDTH.length + WIDTH_DATA_LEN +
            WEBM_PIXEL_HEIGHT.length + HEIGHT_DATA_LEN;
    },

    to_buffer: function(a, at = 0) {
        const dv = new DataView(a);

        const idLength = this.idLength;
        const dataLength = this.constantBufferSize - 8 - idLength;

        const writeFns = [EBML_write_array, EBML_write_u64_data_len, 
                          EBML_write_u8_value, EBML_write_u16_value, 
                          EBML_write_u16_value];

        const argsArray = [
            [this.id, dv, at],
            [dataLength, dv, at],
            [WEBM_FLAG_INTERLACED, this.flag_interlaced, dv, at],
            [WEBM_PIXEL_WIDTH, this.width, dv, at],
            [WEBM_PIXEL_HEIGHT, this.height, dv, at]
        ];

        for (let i = 0; i < writeFns.length; i++) {
            at = writeFns[i](...argsArray[i]);
        }

        return at;
    },

    buffer_size: function() {
        return this.constantBufferSize;
    }
};


/* ---------------------------
   SeekHead not currently used.  Hopefully not needed.
*/
function webm_Seek(seekid, pos)
{
    this.id = WEBM_SEEK;
    this.pos = pos;
    this.seekid = seekid;
}

webm_Seek.prototype =
{
    to_buffer: function(a, at)
    {
        at = at || 0;
        var dv = new DataView(a);
        at = EBML_write_array(this.id, dv, at);
        at = EBML_write_u1_data_len(this.buffer_size() - 1 - this.id.length, dv, at);

        at = EBML_write_data(WEBM_SEEK_ID, this.seekid, dv, at)
        at = EBML_write_u16_value(WEBM_SEEK_POSITION, this.pos, dv, at)

        return at;
    },
    buffer_size: function()
    {
        return this.id.length + 1 +
                WEBM_SEEK_ID.length + 1 + this.seekid.length +
                WEBM_SEEK_POSITION.length + 1 + 2;
    },
}
function webm_SeekHead(info_pos, track_pos)
{
    this.id = WEBM_SEEK_HEAD;
    this.info = new webm_Seek(WEBM_SEGMENT_INFORMATION, info_pos);
    this.track = new webm_Seek(WEBM_TRACKS, track_pos);
}

webm_SeekHead.prototype =
{
    to_buffer: function(a, at)
    {
        at = at || 0;
        var dv = new DataView(a);
        at = EBML_write_array(this.id, dv, at);
        at = EBML_write_u64_data_len(this.buffer_size() - 8 - this.id.length, dv, at);

        at = this.info.to_buffer(a, at);
        at = this.track.to_buffer(a, at);

        return at;
    },
    buffer_size: function()
    {
        return this.id.length + 8 +
                this.info.buffer_size() +
                this.track.buffer_size();
    },
}

/* -------------------------------
   End of Seek Head
*/

function webm_AudioTrackEntry()
{
    this.id = WEBM_TRACK_ENTRY;
    this.number = 1;
    this.uid = 2;  // Arbitrary id; most likely makes no difference
    this.type = 2; // Audio
    this.flag_enabled = 1;
    this.flag_default = 1;
    this.flag_forced = 1;
    this.flag_lacing = 0;
    this.min_cache = 0; // fixme - check
    this.max_block_addition_id = 0;
    this.codec_decode_all = 0; // fixme - check
    this.seek_pre_roll = 0; // 80000000; // fixme - check
    this.codec_delay =   80000000; // Must match codec_private.preskip
    this.codec_id = "A_OPUS";
    this.audio = new webm_Audio(Constants.OPUS_FREQUENCY);

    // See:  http://tools.ietf.org/html/draft-terriberry-oggopus-01
    this.codec_private = [ 0x4f, 0x70, 0x75, 0x73, 0x48, 0x65, 0x61, 0x64,  // OpusHead
                           0x01, // Version
                           Constants.OPUS_CHANNELS,
                           0x00, 0x0F, // Preskip - 3840 samples - should be 8ms at 48kHz
                           0x80, 0xbb, 0x00, 0x00,  // 48000
                           0x00, 0x00, // Output gain
                           0x00  // Channel mapping family
                           ];
}

webm_AudioTrackEntry.prototype =
{
    to_buffer: function(a, at)
    {
        at = at || 0;
        var dv = new DataView(a);
        at = EBML_write_array(this.id, dv, at);
        at = EBML_write_u64_data_len(this.buffer_size() - 8 - this.id.length, dv, at);
        at = EBML_write_u8_value(WEBM_TRACK_NUMBER, this.number, dv, at);
        at = EBML_write_u8_value(WEBM_TRACK_UID, this.uid, dv, at);
        at = EBML_write_u8_value(WEBM_FLAG_ENABLED, this.flag_enabled, dv, at);
        at = EBML_write_u8_value(WEBM_FLAG_DEFAULT, this.flag_default, dv, at);
        at = EBML_write_u8_value(WEBM_FLAG_FORCED, this.flag_forced, dv, at);
        at = EBML_write_u8_value(WEBM_FLAG_LACING, this.flag_lacing, dv, at);
        at = EBML_write_data(WEBM_CODEC_ID, this.codec_id, dv, at);
        at = EBML_write_u8_value(WEBM_MIN_CACHE, this.min_cache, dv, at);
        at = EBML_write_u8_value(WEBM_MAX_BLOCK_ADDITION_ID, this.max_block_addition_id, dv, at);
        at = EBML_write_u8_value(WEBM_CODEC_DECODE_ALL, this.codec_decode_all, dv, at);
        at = EBML_write_u32_value(WEBM_CODEC_DELAY, this.codec_delay, dv, at);
        at = EBML_write_u32_value(WEBM_SEEK_PRE_ROLL, this.seek_pre_roll, dv, at);
        at = EBML_write_u8_value(WEBM_TRACK_TYPE, this.type, dv, at);
        at = EBML_write_data(WEBM_CODEC_PRIVATE, this.codec_private, dv, at);

        at = this.audio.to_buffer(a, at);
        return at;
    },
    buffer_size: function()
    {
        return this.id.length + 8 +
            WEBM_TRACK_NUMBER.length + 1 + 1 +
            WEBM_TRACK_UID.length + 1 + 1 +
            WEBM_TRACK_TYPE.length + 1 + 1 +
            WEBM_FLAG_ENABLED.length + 1 + 1 +
            WEBM_FLAG_DEFAULT.length + 1 + 1 +
            WEBM_FLAG_FORCED.length + 1 + 1 +
            WEBM_FLAG_LACING.length + 1 + 1 +
            WEBM_MIN_CACHE.length + 1 + 1 +
            WEBM_MAX_BLOCK_ADDITION_ID.length + 1 + 1 +
            WEBM_CODEC_DECODE_ALL.length + 1 + 1 +
            WEBM_SEEK_PRE_ROLL.length + 1 + 4 +
            WEBM_CODEC_DELAY.length + 1 + 4 +
            WEBM_CODEC_ID.length + this.codec_id.length + 1 +
            WEBM_CODEC_PRIVATE.length + 1 + this.codec_private.length +
            this.audio.buffer_size();
    },
}

function webm_VideoTrackEntry(width, height) {
    this.initializeConstants(width, height);
}

webm_VideoTrackEntry.prototype = {
    initializeConstants: function(width, height) {
        this.id = WEBM_TRACK_ENTRY;
        this.number = 1;
        this.uid = 1;
        this.type = 1; // Video
        this.flag_enabled = 1;
        this.flag_default = 1;
        this.flag_forced = 1; // Different than default; we wish to force
        this.flag_lacing = 1;
        this.min_cache = 0;
        this.max_block_addition_id = 0;
        this.codec_id = "V_VP8";
        this.codec_decode_all = 1;
        this.seek_pre_roll = 0;

        this.codec_idLength = this.codec_id.length;

        this.video = new webm_Video(width, height);
        this.videoBufferSize = this.video.buffer_size();

        this.constantBufferSize = this.computeConstantBufferSize();
    },

    computeConstantBufferSize: function() {
        const LENGTH_PLUS_ONE = 1;  // Used to denote length or flag values
        const SEEK_PRE_ROLL_SIZE = 4;

        return this.id.length + 8 +
            WEBM_TRACK_NUMBER.length + LENGTH_PLUS_ONE +
            WEBM_TRACK_UID.length + LENGTH_PLUS_ONE +
            WEBM_FLAG_ENABLED.length + LENGTH_PLUS_ONE +
            WEBM_FLAG_DEFAULT.length + LENGTH_PLUS_ONE +
            WEBM_FLAG_FORCED.length + LENGTH_PLUS_ONE +
            WEBM_FLAG_LACING.length + LENGTH_PLUS_ONE +
            WEBM_CODEC_ID.length + this.codec_idLength + LENGTH_PLUS_ONE +
            WEBM_MIN_CACHE.length + LENGTH_PLUS_ONE +
            WEBM_MAX_BLOCK_ADDITION_ID.length + LENGTH_PLUS_ONE +
            WEBM_CODEC_DECODE_ALL.length + LENGTH_PLUS_ONE +
            WEBM_SEEK_PRE_ROLL.length + SEEK_PRE_ROLL_SIZE +
            WEBM_TRACK_TYPE.length + LENGTH_PLUS_ONE +
            this.videoBufferSize;
    },

    to_buffer: function(a, at = 0) {
        const dv = new DataView(a);

        const writeFns = [
            EBML_write_array, EBML_write_u64_data_len,
            EBML_write_u8_value, EBML_write_u8_value,
            EBML_write_u8_value, EBML_write_u8_value,
            EBML_write_u8_value, EBML_write_data,
            EBML_write_u8_value, EBML_write_u8_value,
            EBML_write_u8_value, EBML_write_u32_value,
            EBML_write_u8_value
        ];

        const fieldArgs = [
            [this.id, dv, at],
            [this.constantBufferSize - 8 - this.id.length, dv, at],
            [WEBM_TRACK_NUMBER, this.number, dv, at],
            [WEBM_TRACK_UID, this.uid, dv, at],
            [WEBM_FLAG_ENABLED, this.flag_enabled, dv, at],
            [WEBM_FLAG_DEFAULT, this.flag_default, dv, at],
            [WEBM_FLAG_FORCED, this.flag_forced, dv, at],
            [WEBM_FLAG_LACING, this.flag_lacing, dv, at],
            [WEBM_CODEC_ID, this.codec_id, dv, at],
            [WEBM_MIN_CACHE, this.min_cache, dv, at],
            [WEBM_MAX_BLOCK_ADDITION_ID, this.max_block_addition_id, dv, at],
            [WEBM_CODEC_DECODE_ALL, this.codec_decode_all, dv, at],
            [WEBM_SEEK_PRE_ROLL, this.seek_pre_roll, dv, at],
            [WEBM_TRACK_TYPE, this.type, dv, at]
        ];

        for (let i = 0; i < writeFns.length; i++) {
            at = writeFns[i](...fieldArgs[i]);
        }

        return this.video.to_buffer(a, at);
    },

    buffer_size: function() {
        return this.constantBufferSize;
    }
};


function webm_Tracks(entry) {
    this.id = WEBM_TRACKS;
    this.track_entry = entry;
}

webm_Tracks.prototype = {
    to_buffer: function(a, at = 0) {
        const dv = new DataView(a);
        at = EBML_write_array(this.id, dv, at);
        const dataLen = this.buffer_size() - 8 - this.id.length;
        at = EBML_write_u64_data_len(dataLen, dv, at);
        return this.track_entry.to_buffer(a, at);
    },
    buffer_size: function() {
        return this.id.length + 8 +
            this.track_entry.buffer_size();
    },
};

function webm_Cluster(timecode, data) {
    this.id = WEBM_CLUSTER;
    this.timecode = timecode;
    this.data = data;
}

webm_Cluster.prototype = {
    to_buffer: function(a, at = 0) {
        const dv = new DataView(a);
        at = EBML_write_array(this.id, dv, at);
        dv.setUint8(at++, 0xff);
        return EBML_write_u32_value(WEBM_TIME_CODE, this.timecode, dv, at);
    },
    buffer_size: function() {
        return this.id.length + 1 +
            WEBM_TIME_CODE.length + 5;
    },
};

function webm_SimpleBlock(timecode, data, keyframe) {
    this.id = WEBM_SIMPLE_BLOCK;
    this.timecode = timecode;
    this.data = data;
    this.keyframe = keyframe;
}

webm_SimpleBlock.prototype = {
    to_buffer: function(a, at = 0) {
        const dv = new DataView(a);
        at = EBML_write_array(this.id, dv, at);
        at = EBML_write_u64_data_len(this.data.byteLength + 4, dv, at);
        at = EBML_write_u1_data_len(1, dv, at); // Track #
        dv.setUint16(at, this.timecode); at += 2; // timecode - relative to cluster
        dv.setUint8(at, this.keyframe ? Constants.CLUSTER_SIMPLEBLOCK_FLAG_KEYFRAME : 0); at += 1;  // flags

        new Uint8Array(a, at, this.data.byteLength).set(new Uint8Array(this.data));
        at += this.data.byteLength;

        return at;
    },
    buffer_size: function() {
        return this.id.length + 8 +
            4 + this.data.byteLength;
    },
};

function webm_Header() {
    const segmentBufferSize = this.segment.buffer_size();
    const seekHeadBufferSize = this.seek_head.buffer_size();

    this.ebml = new EBMLHeader();
    this.segment = new webm_Segment();
    this.seek_head = new webm_SeekHead(0, 0);

    this.seek_head.info.pos = segmentBufferSize + seekHeadBufferSize;

    this.info = new webm_SegmentInformation();

    const infoBufferSize = this.info.buffer_size();
    this.seek_head.track.pos = this.seek_head.info.pos + infoBufferSize;
}

webm_Header.prototype = {
    to_buffer: function(a, at = 0) {
        at = this.ebml.to_buffer(a, at);
        at = this.segment.to_buffer(a, at);
        return this.info.to_buffer(a, at);
    },
    buffer_size: function() {
        const ebmlBufferSize = this.ebml.buffer_size();
        const segmentBufferSize = this.segment.buffer_size();
        const infoBufferSize = this.info.buffer_size();

        return ebmlBufferSize + segmentBufferSize + infoBufferSize;
    },
}


export {
  Constants,
  webm_Audio as Audio,
  webm_Video as Video,
  webm_AudioTrackEntry as AudioTrackEntry,
  webm_VideoTrackEntry as VideoTrackEntry,
  webm_Tracks as Tracks,
  webm_Cluster as Cluster,
  webm_SimpleBlock as SimpleBlock,
  webm_Header as Header,
};
