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

import { KeyNames } from './atKeynames.js';
import { code_to_scancode } from './code_to_scancode.js';

/*----------------------------------------------------------------------------
**  Utility settings and functions for Spice
**--------------------------------------------------------------------------*/
var DEBUG = 0;
var PLAYBACK_DEBUG = 0;
var STREAM_DEBUG = 0;
var DUMP_DRAWS = false;
var DUMP_CANVASES = false;
var DUMP_JPEG = false;
var DUMP_DRAW_COPY = false;

/*----------------------------------------------------------------------------
**  We use an Image temporarily, and the image/src does not get garbage
**   collected as quickly as we might like.  This blank image helps with that.
**--------------------------------------------------------------------------*/
var EMPTY_GIF_IMAGE = "data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=";

/*----------------------------------------------------------------------------
**  combine_array_buffers
**      Combine two array buffers.
**      FIXME - this can't be optimal.  See wire.js about eliminating the need.
**--------------------------------------------------------------------------*/
function combine_array_buffers(a1, a2)
{
    const ret = new ArrayBuffer(a1.byteLength + a2.byteLength);
    const out = new Uint8Array(ret);
    
    out.set(new Uint8Array(a1), 0);
    out.set(new Uint8Array(a2), a1.byteLength);

    return ret;
}

/*----------------------------------------------------------------------------
**  hexdump_buffer
**--------------------------------------------------------------------------*/
function hexdump_buffer(a) {
    const mg = new Uint8Array(a);
    let hexArray = [];
    let strArray = [];
    let lastZeros = 0;
    let i = 0;

    while (i < mg.length) {
        const byte = mg[i];
        hexArray.push((byte < 16 ? '0' : '') + byte.toString(16));

        strArray.push((byte === 10 || byte === 13 || byte === 8) ? '.' : String.fromCharCode(byte));

        if ((i % 16 === 15) || (i === mg.length - 1)) {
            while (i % 16 !== 15) {
                hexArray.push('  ');
                i++;
            }

            const hexLine = hexArray.join(" ");
            const strLine = strArray.join("");

            if (lastZeros === 0) {
                console.log(hexLine + " | " + strLine);
            }

            if (hexLine === "00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ") {
                if (lastZeros === 1) {
                    console.log(".");
                    lastZeros++;
                } else if (lastZeros === 0) {
                    lastZeros++;
                }
            } else {
                lastZeros = 0;
            }

            hexArray.length = 0;
            strArray.length = 0;
        }

        i++;
    }
}

/*----------------------------------------------------------------------------
**  Convert arraybuffer to string
**--------------------------------------------------------------------------*/
function arraybuffer_to_str(buf) {
  return String.fromCharCode.apply(null, new Uint16Array(buf));
}

/*----------------------------------------------------------------------------
** Converting browser keycodes to AT scancodes is very hard.
**  Spice transmits keys using the original AT scan codes, often
**   described as 'Scan Code Set 1'.
**  There is a confusion of other scan codes; Xorg synthesizes it's
**   own in the same atKeynames.c file that has the XT codes.
**  Scan code set 2 and 3 are more common, and use different values.
** Further, there is no formal specification for keycodes
**  returned by browsers, so we have done our mapping largely with
**  empirical testing.
** There has been little rigorous testing with International keyboards,
**  and this would be an easy area for non English speakers to contribute.
**--------------------------------------------------------------------------*/
var common_scanmap = [];

/* The following appear to be keycodes that work in most browsers */
common_scanmap['1'.charCodeAt(0)]  = KeyNames.KEY_1;
common_scanmap['2'.charCodeAt(0)]  = KeyNames.KEY_2;
common_scanmap['3'.charCodeAt(0)]  = KeyNames.KEY_3;
common_scanmap['4'.charCodeAt(0)]  = KeyNames.KEY_4;
common_scanmap['5'.charCodeAt(0)]  = KeyNames.KEY_5;
common_scanmap['6'.charCodeAt(0)]  = KeyNames.KEY_6;
common_scanmap['7'.charCodeAt(0)]  = KeyNames.KEY_7;
common_scanmap['8'.charCodeAt(0)]  = KeyNames.KEY_8;
common_scanmap['9'.charCodeAt(0)]  = KeyNames.KEY_9;
common_scanmap['0'.charCodeAt(0)]  = KeyNames.KEY_0;
common_scanmap[145]                = KeyNames.KEY_ScrollLock;
common_scanmap[103]                = KeyNames.KEY_KP_7;
common_scanmap[104]                = KeyNames.KEY_KP_8;
common_scanmap[105]                = KeyNames.KEY_KP_9;
common_scanmap[100]                = KeyNames.KEY_KP_4;
common_scanmap[101]                = KeyNames.KEY_KP_5;
common_scanmap[102]                = KeyNames.KEY_KP_6;
common_scanmap[107]                = KeyNames.KEY_KP_Plus;
common_scanmap[97]                 = KeyNames.KEY_KP_1;
common_scanmap[98]                 = KeyNames.KEY_KP_2;
common_scanmap[99]                 = KeyNames.KEY_KP_3;
common_scanmap[96]                 = KeyNames.KEY_KP_0;
common_scanmap[109]                = KeyNames.KEY_Minus;
common_scanmap[110]                = KeyNames.KEY_KP_Decimal;
common_scanmap[191]                = KeyNames.KEY_Slash;
common_scanmap[190]                = KeyNames.KEY_Period;
common_scanmap[188]                = KeyNames.KEY_Comma;
common_scanmap[220]                = KeyNames.KEY_BSlash;
common_scanmap[192]                = KeyNames.KEY_Tilde;
common_scanmap[222]                = KeyNames.KEY_Quote;
common_scanmap[219]                = KeyNames.KEY_LBrace;
common_scanmap[221]                = KeyNames.KEY_RBrace;

common_scanmap['Q'.charCodeAt(0)]  = KeyNames.KEY_Q;
common_scanmap['W'.charCodeAt(0)]  = KeyNames.KEY_W;
common_scanmap['E'.charCodeAt(0)]  = KeyNames.KEY_E;
common_scanmap['R'.charCodeAt(0)]  = KeyNames.KEY_R;
common_scanmap['T'.charCodeAt(0)]  = KeyNames.KEY_T;
common_scanmap['Y'.charCodeAt(0)]  = KeyNames.KEY_Y;
common_scanmap['U'.charCodeAt(0)]  = KeyNames.KEY_U;
common_scanmap['I'.charCodeAt(0)]  = KeyNames.KEY_I;
common_scanmap['O'.charCodeAt(0)]  = KeyNames.KEY_O;
common_scanmap['P'.charCodeAt(0)]  = KeyNames.KEY_P;
common_scanmap['A'.charCodeAt(0)]  = KeyNames.KEY_A;
common_scanmap['S'.charCodeAt(0)]  = KeyNames.KEY_S;
common_scanmap['D'.charCodeAt(0)]  = KeyNames.KEY_D;
common_scanmap['F'.charCodeAt(0)]  = KeyNames.KEY_F;
common_scanmap['G'.charCodeAt(0)]  = KeyNames.KEY_G;
common_scanmap['H'.charCodeAt(0)]  = KeyNames.KEY_H;
common_scanmap['J'.charCodeAt(0)]  = KeyNames.KEY_J;
common_scanmap['K'.charCodeAt(0)]  = KeyNames.KEY_K;
common_scanmap['L'.charCodeAt(0)]  = KeyNames.KEY_L;
common_scanmap['Z'.charCodeAt(0)]  = KeyNames.KEY_Z;
common_scanmap['X'.charCodeAt(0)]  = KeyNames.KEY_X;
common_scanmap['C'.charCodeAt(0)]  = KeyNames.KEY_C;
common_scanmap['V'.charCodeAt(0)]  = KeyNames.KEY_V;
common_scanmap['B'.charCodeAt(0)]  = KeyNames.KEY_B;
common_scanmap['N'.charCodeAt(0)]  = KeyNames.KEY_N;
common_scanmap['M'.charCodeAt(0)]  = KeyNames.KEY_M;
common_scanmap[' '.charCodeAt(0)]  = KeyNames.KEY_Space;
common_scanmap[13]                 = KeyNames.KEY_Enter;
common_scanmap[27]                 = KeyNames.KEY_Escape;
common_scanmap[8]                  = KeyNames.KEY_BackSpace;
common_scanmap[9]                  = KeyNames.KEY_Tab;
common_scanmap[16]                 = KeyNames.KEY_ShiftL;
common_scanmap[17]                 = KeyNames.KEY_LCtrl;
common_scanmap[18]                 = KeyNames.KEY_Alt;
common_scanmap[20]                 = KeyNames.KEY_CapsLock;
common_scanmap[44]                 = KeyNames.KEY_SysReqest;
common_scanmap[144]                = KeyNames.KEY_NumLock;
common_scanmap[112]                = KeyNames.KEY_F1;
common_scanmap[113]                = KeyNames.KEY_F2;
common_scanmap[114]                = KeyNames.KEY_F3;
common_scanmap[115]                = KeyNames.KEY_F4;
common_scanmap[116]                = KeyNames.KEY_F5;
common_scanmap[117]                = KeyNames.KEY_F6;
common_scanmap[118]                = KeyNames.KEY_F7;
common_scanmap[119]                = KeyNames.KEY_F8;
common_scanmap[120]                = KeyNames.KEY_F9;
common_scanmap[121]                = KeyNames.KEY_F10;
common_scanmap[122]                = KeyNames.KEY_F11;
common_scanmap[123]                = KeyNames.KEY_F12;

/* TODO:  Break and Print are complex scan codes.  XSpice cheats and
   uses Xorg synthesized codes to simplify them.  Fixing this will
   require XSpice to handle the scan codes correctly, and then
   fix spice-html5 to send the complex scan codes. */
common_scanmap[42]                 = 99; // Print, XSpice only
common_scanmap[19]                 = 101;// Break, XSpice only

/* Handle the so called 'GREY' keys, for the extended keys that
   were grey on the original AT keyboard.  These are
   prefixed, as they were on the PS/2 controller, with an
   0xE0 byte to indicate that they are extended */
common_scanmap[111]                = 0xE0 | (KeyNames.KEY_Slash << 8);// KP_Divide
common_scanmap[106]                = 0xE0 | (KeyNames.KEY_KP_Multiply << 8); // KP_Multiply
common_scanmap[36]                 = 0xE0 | (KeyNames.KEY_KP_7 << 8); // Home
common_scanmap[38]                 = 0xE0 | (KeyNames.KEY_KP_8 << 8); // Up
common_scanmap[33]                 = 0xE0 | (KeyNames.KEY_KP_9 << 8); // PgUp
common_scanmap[37]                 = 0xE0 | (KeyNames.KEY_KP_4 << 8); // Left
common_scanmap[39]                 = 0xE0 | (KeyNames.KEY_KP_6 << 8); // Right
common_scanmap[35]                 = 0xE0 | (KeyNames.KEY_KP_1 << 8); // End
common_scanmap[40]                 = 0xE0 | (KeyNames.KEY_KP_2 << 8); // Down
common_scanmap[34]                 = 0xE0 | (KeyNames.KEY_KP_3 << 8); // PgDown
common_scanmap[45]                 = 0xE0 | (KeyNames.KEY_KP_0 << 8); // Insert
common_scanmap[46]                 = 0xE0 | (KeyNames.KEY_KP_Decimal << 8); // Delete
common_scanmap[91]                 = 0xE0 | (0x5B << 8); //KeyNames.KEY_LMeta
common_scanmap[92]                 = 0xE0 | (0x5C << 8); //KeyNames.KEY_RMeta
common_scanmap[93]                 = 0xE0 | (0x5D << 8); //KeyNames.KEY_Menu

/* Firefox/Mozilla codes */
var firefox_scanmap = [];
firefox_scanmap[173]                = KeyNames.KEY_Minus;
firefox_scanmap[61]                 = KeyNames.KEY_Equal;
firefox_scanmap[59]                 = KeyNames.KEY_SemiColon;

/* DOM3 codes */
var DOM_scanmap = [];
DOM_scanmap[189]                = KeyNames.KEY_Minus;
DOM_scanmap[187]                = KeyNames.KEY_Equal;
DOM_scanmap[186]                = KeyNames.KEY_SemiColon;

function get_scancode(keyCode, code) {
    if (code_to_scancode.hasOwnProperty(code)) {
        return code_to_scancode[code];
    }

    const scanmap = common_scanmap[keyCode];
    if (scanmap !== undefined) {
        return scanmap;
    }

    return firefox_scanmap[keyCode];
}

function toScanCode(keyCode, code, alertOnUndefined = false) {
    const scancode = get_scancode(keyCode, code);
    if (scancode === undefined) {
        if (alertOnUndefined) {
            alert('no map for ' + keyCode);
        }
        return 0;
    }
    return scancode;
}

function keycode_to_start_scan(keyCode, code) {
    return toScanCode(keyCode, code, true);
}

function keycode_to_end_scan(keyCode, code) {
    const scancode = toScanCode(keyCode, code);
    if (scancode === 0) {
        return 0;
    }

    const mask = (scancode < 0x100) ? 0x80 : 0x8000;
    return scancode | mask;
}

function dump_media_element(m)
{
    var ret =
            "[networkState " + m.networkState +
            "|readyState " + m.readyState +
            "|error " + m.error +
            "|seeking " + m.seeking +
            "|duration " + m.duration +
            "|paused " + m.paused +
            "|ended " + m.error +
            "|buffered " + dump_timerange(m.buffered) +
            "]";
    return ret;
}

function dump_media_source(ms)
{
    var ret =
            "[duration " + ms.duration +
            "|readyState " + ms.readyState + "]";
    return ret;
}

function dump_source_buffer(sb)
{
    var ret =
            "[appendWindowStart " + sb.appendWindowStart +
            "|appendWindowEnd " + sb.appendWindowEnd +
            "|buffered " + dump_timerange(sb.buffered) +
            "|timeStampOffset " + sb.timeStampOffset +
            "|updating " + sb.updating +
            "]";
    return ret;
}

function dump_timerange(tr)
{
    var ret;

    if (tr)
    {
        var i = tr.length;
        ret = "{len " + i;
        if (i > 0)
            ret += "; start " + tr.start(0) + "; end " + tr.end(i - 1);
        ret += "}";
    }
    else
        ret = "N/A";

    return ret;
}

export {
  DEBUG,
  PLAYBACK_DEBUG,
  STREAM_DEBUG,
  DUMP_DRAWS,
  DUMP_CANVASES,
  EMPTY_GIF_IMAGE,
  DUMP_JPEG,
  DUMP_DRAW_COPY,
  combine_array_buffers,
  hexdump_buffer,
  arraybuffer_to_str,
  keycode_to_start_scan,
  keycode_to_end_scan,
  dump_media_element,
  dump_media_source,
  dump_source_buffer,
};
