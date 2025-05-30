/*"use strict";
/* use strict is commented out because it results in a 5x slowdone in chrome */
/*
 *    Copyright (C) 2012 by Jeremy P. White <jwhite@codeweavers.com>
 *    Copyright (C) 2012 by Aric Stewart <aric@codeweavers.com>
 *
 *    This file is part of spice-html5.
 *
 *    spice-html5 is free software: you can redistribute it and/or modify
 *    it under the terms of the GNU Lesser General Public License as published by
 *    the Free Software Foundation, either version 3 of the License, or
 *    (at your option) any later version.
 *
 *    spice-html5 is distributed in the hope that it will be useful,
 *    but WITHOUT ANY WARRANTY; without even the implied warranty of
 *    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *    GNU Lesser General Public License for more details.
 *
 *    You should have received a copy of the GNU Lesser General Public License
 *    along with spice-html5.  If not, see <http://www.gnu.org/licenses/>.
 */

let encoder;

const Constants = {
  QUIC_IMAGE_TYPE_INVALID : 0,
  QUIC_IMAGE_TYPE_GRAY : 1,
  QUIC_IMAGE_TYPE_RGB16 : 2,
  QUIC_IMAGE_TYPE_RGB24 : 3,
  QUIC_IMAGE_TYPE_RGB32 : 4,
  QUIC_IMAGE_TYPE_RGBA : 5,
  INIT_COUNTERS : 8,
  MAX_WMIDX : 10,
  QUIC_MAGIC : 0x43495551,
  DEFAULT_VERSION : 0x00000000,
};

const DEFevol = 3;
const DEFwmimax = 6;
const DEFwminext = 2048;
const DEFmaxclen = 26;

let need_init = true;

let evol = DEFevol;
let wmimax = DEFwmimax;
let wminext = DEFwminext;

const family_5bpc = {
  nGRcodewords: new Uint32Array(8),
  notGRcwlen: new Uint8Array(8),
  notGRprefixmask: new Uint32Array(8),
  notGRsuffixlen: new Uint8Array(8),
  xlatU2L: new Uint8Array(8),
  xlatL2U: new Uint8Array(8)
};

const family_8bpc = {
  nGRcodewords: new Uint32Array(8),
  notGRcwlen: new Uint8Array(8),
  notGRprefixmask: new Uint32Array(8),
  notGRsuffixlen: new Uint8Array(8),
  xlatU2L: new Uint8Array(256),
  xlatL2U: new Uint8Array(256)
};

const bppmask = new Uint32Array([
  0x00000000, 0x00000001, 0x00000003, 0x00000007, 0x0000000f,
  0x0000001f, 0x0000003f, 0x0000007f, 0x000000ff, 0x000001ff,
  0x000003ff, 0x000007ff, 0x00000fff, 0x00001fff, 0x00003fff,
  0x00007fff, 0x0000ffff, 0x0001ffff, 0x0003ffff, 0x0007ffff,
  0x000fffff, 0x001fffff, 0x003fffff, 0x007fffff, 0x00ffffff,
  0x01ffffff, 0x03ffffff, 0x07ffffff, 0x0fffffff, 0x1fffffff,
  0x3fffffff, 0x7fffffff, 0xffffffff
]);

const besttrigtab = [
  new Uint16Array([550, 900, 800, 700, 500, 350, 300, 200, 180, 180, 160]),
  new Uint16Array([110, 550, 900, 800, 550, 400, 350, 250, 140, 160, 140]),
  new Uint16Array([100, 120, 550, 900, 700, 500, 400, 300, 220, 250, 160])
];

const J = new Uint8Array([
  0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 5, 5, 6, 6,
  7, 7, 8, 9, 10, 11, 12, 13, 14, 15
]);

const lzeroes = new Uint8Array([
  8, 7, 6, 6, 5, 5, 5, 5, 4, 4, 4, 4, 4, 4, 4, 4, 3, 3, 3, 3, 3, 3, 3, 3, 3,
  3, 3, 3, 3, 3, 3, 3, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2,
  2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1,
  1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1,
  1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1,
  1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0
]);

const tabrand_chaos = new Uint32Array([
  0x02c57542, 0x35427717, 0x2f5a2153, 0x9244f155, 0x7bd26d07, 0x354c6052,
  0x57329b28, 0x2993868e, 0x6cd8808c, 0x147b46e0, 0x99db66af, 0xe32b4cac,
  0x1b671264, 0x9d433486, 0x62a4c192, 0x06089a4b, 0x9e3dce44, 0xdaabee13,
  0x222425ea, 0xa46f331d, 0xcd589250, 0x8bb81d7f, 0xc8b736b9, 0x35948d33,
  0xd7ac7fd0, 0x5fbe2803, 0x2cfbc105, 0x013dbc4e, 0x7a37820f, 0x39f88e9e,
  0xedd58794, 0xc5076689, 0xfcada5a4, 0x64c2f46d, 0xb3ba3243, 0x8974b4f9,
  0x5a05aebd, 0x20afcd00, 0x39e2b008, 0x88a18a45, 0x600bde29, 0xf3971ace,
  0xf37b0a6b, 0x7041495b, 0x70b707ab, 0x06beffbb, 0x4206051f, 0xe13c4ee3,
  0xc1a78327, 0x91aa067c, 0x8295f72a, 0x732917a6, 0x1d871b4d, 0x4048f136,
  0xf1840e7e, 0x6a6048c1, 0x696cb71a, 0x7ff501c3, 0x0fc6310b, 0x57e0f83d,
  0x8cc26e74, 0x11a525a2, 0x946934c7, 0x7cd888f0, 0x8f9d8604, 0x4f86e73b,
  0x04520316, 0xdeeea20c, 0xf1def496, 0x67687288, 0xf540c5b2, 0x22401484,
  0x3478658a, 0xc2385746, 0x01979c2c, 0x5dad73c8, 0x0321f58b, 0xf0fedbee,
  0x92826ddf, 0x284bec73, 0x5b1a1975, 0x03df1e11, 0x20963e01, 0xa17cf12b,
  0x740d776e, 0xa7a6bf3c, 0x01b5cce4, 0x1118aa76, 0xfc6fac0a, 0xce927e9b,
  0x00bf2567, 0x806f216c, 0xbca69056, 0x795bd3e9, 0xc9dc4557, 0x8929b6c2,
  0x789d52ec, 0x3f3fbf40, 0xb9197368, 0xa38c15b5, 0xc3b44fa8, 0xca8333b0,
  0xb7e8d590, 0xbe807feb, 0xbf5f8360, 0xd99e2f5c, 0x372928e1, 0x7c757c4c,
  0x0db5b154, 0xc01ede02, 0x1fc86e78, 0x1f3985be, 0xb4805c77, 0x00c880fa,
  0x974c1b12, 0x35ab0214, 0xb2dc840d, 0x5b00ae37, 0xd313b026, 0xb260969d,
  0x7f4c8879, 0x1734c4d3, 0x49068631, 0xb9f6a021, 0x6b863e6f, 0xcee5debf,
  0x29f8c9fb, 0x53dd6880, 0x72b61223, 0x1f67a9fd, 0x0a0f6993, 0x13e59119,
  0x11cca12e, 0xfe6b6766, 0x16b6effc, 0x97918fc4, 0xc2b8a563, 0x94f2f741,
  0x0bfa8c9a, 0xd1537ae8, 0xc1da349c, 0x873c60ca, 0x95005b85, 0x9b5c080e,
  0xbc8abbd9, 0xe1eab1d2, 0x6dac9070, 0x4ea9ebf1, 0xe0cf30d4, 0x1ef5bd7b,
  0xd161043e, 0x5d2fa2e2, 0xff5d3cae, 0x86ed9f87, 0x2aa1daa1, 0xbd731a34,
  0x9e8f4b22, 0xb1c2c67a, 0xc21758c9, 0xa182215d, 0xccb01948, 0x8d168df7,
  0x04238cfe, 0x368c3dbc, 0x0aeadca5, 0xbad21c24, 0x0a71fee5, 0x9fc5d872,
  0x54c152c6, 0xfc329483, 0x6783384a, 0xeddb3e1c, 0x65f90e30, 0x884ad098,
  0xce81675a, 0x4b372f7d, 0x68bf9a39, 0x43445f1e, 0x40f8d8cb, 0x90d5acb6,
  0x4cd07282, 0x349eeb06, 0x0c9d5332, 0x520b24ef, 0x80020447, 0x67976491,
  0x2f931ca3, 0xfe9b0535, 0xfcd30220, 0x61a9e6cc, 0xa487d8d7, 0x3f7c5dd1,
  0x7d0127c5, 0x48f51d15, 0x60dea871, 0xc9a91cb7, 0x58b53bb3, 0x9d5e0b2d,
  0x624a78b4, 0x30dbee1b, 0x9bdf22e7, 0x1df5c299, 0x2d5643a7, 0xf4dd35ff,
  0x03ca8fd6, 0x53b47ed8, 0x6f2c19aa, 0xfeb0c1f4, 0x49e54438, 0x2f2577e6,
  0xbf876969, 0x72440ea9, 0xfa0bafb8, 0x74f5b3a0, 0x7dd357cd, 0x89ce1358,
  0x6ef2cdda, 0x1e7767f3, 0xa6be9fdb, 0x4f5f88f8, 0xba994a3a, 0x08ca6b65,
  0xe0893818, 0x9e00a16a, 0xf42bfc8f, 0x9972eedc, 0x749c8b51, 0x32c05f5e,
  0xd706805f, 0x6bfbb7cf, 0xd9210a10, 0x31a1db97, 0x923a9559, 0x37a7a1f6,
  0x059f8861, 0xca493e62, 0x65157e81, 0x8f6467dd, 0xab85ff9f, 0x9331aff2,
  0x8616b9f5, 0xedbd5695, 0xee7e29b1, 0x313ac44f, 0xb903112f, 0x432ef649,
  0xdc0a36c0, 0x61cf2bba, 0x81474925, 0xa8b6c7ad, 0xee5931de, 0xb2f8158d,
  0x59fb7409, 0x2e3dfaed, 0x9af25a3f, 0xe1fed4d5
]);

const rgb32_pixel_pad = 3;
const rgb32_pixel_r = 2;
const rgb32_pixel_g = 1;
const rgb32_pixel_b = 0;
const rgb32_pixel_size = 4;

const zeroLUT = new Uint8Array(256);
{
  let j = 1, k = 1, l = 8;
  for (let i = 0; i < 256; ++i) {
    zeroLUT[i] = l;
    if (--k === 0) {
      k = j;
      l--;
      j *= 2;
    }
  }
}

const BPC_MAP = {
  [Constants.QUIC_IMAGE_TYPE_GRAY]: 8,
  [Constants.QUIC_IMAGE_TYPE_RGB16]: 5,
  [Constants.QUIC_IMAGE_TYPE_RGB24]: 8,
  [Constants.QUIC_IMAGE_TYPE_RGB32]: 8,
  [Constants.QUIC_IMAGE_TYPE_RGBA]: 8
};

/* Helper Functions */

function ceil_log_2(val)
{
    if (val === 1)
        return 0;

    var result = 1;
    val -= 1;
    while (val = val >>> 1)
        result++;

    return result;
}

function family_init(family, bpc, limit)
{
    var l;
    for (l = 0; l < bpc; l++)
    {
        var altprefixlen, altcodewords;
        altprefixlen = limit - bpc;
        if (altprefixlen > bppmask[bpc - l])
            altprefixlen = bppmask[bpc - l];

        altcodewords = bppmask[bpc] + 1 - (altprefixlen << l);
        family.nGRcodewords[l] = (altprefixlen << l);
        family.notGRcwlen[l] = altprefixlen + ceil_log_2(altcodewords);
        family.notGRprefixmask[l] = bppmask[32 - altprefixlen]>>>0;
        family.notGRsuffixlen[l] = ceil_log_2(altcodewords);
    }

    /* decorelate_init */
    var pixelbitmask = bppmask[bpc];
    var pixelbitmaskshr = pixelbitmask >>> 1;
    var s;
    for (s = 0; s <= pixelbitmask; s++) {
        if (s <= pixelbitmaskshr) {
            family.xlatU2L[s] = s << 1;
        } else {
            family.xlatU2L[s] = ((pixelbitmask - s) << 1) + 1;
        }
    }

    /* corelate_init */
    for (s = 0; s <= pixelbitmask; s++) {
        if (s & 0x01) {
            family.xlatL2U[s] = pixelbitmask - (s >>> 1);
        } else {
            family.xlatL2U[s] = (s >>> 1);
        }
    }
}



function quic_image_bpc(type) {
  const bpc = BPC_MAP[type];
  if (bpc !== undefined) return bpc;
  
  console.log("quic: bad image type\n");
  return 0;
}

function golomb_decoding_8bpc(l, bits) {
    const clz32 = (x) => x ? Math.clz32(x) : 32;
    
    if ((bits | 0) >= 0 && bits <= family_8bpc.notGRprefixmask[l]) {
        const cwlen = family_8bpc.notGRcwlen[l];
        const suffix = (bits >> (32 - cwlen)) & bppmask[family_8bpc.notGRsuffixlen[l]];
        return { codewordlen: cwlen, rc: family_8bpc.nGRcodewords[l] + suffix };
    }
    
    const zeroprefix = clz32(bits);
    const cwlen = zeroprefix + 1 + l;
    const suffix = (bits >> (32 - cwlen)) & bppmask[l];
    const rc = (zeroprefix << l) | suffix;
    
    return { codewordlen: cwlen, rc };
}

function golomb_code_len_8bpc(n, l) {
    const nGR = family_8bpc.nGRcodewords[l];
    return n < nGR 
        ? (n >>> l) + 1 + l 
        : family_8bpc.notGRcwlen[l];
}

function QuicModel(bpc)
{
    const EVOL_CONFIG = {
        1: { repfirst: 3, firstsize: 1, repnext: 2, mulsize: 2 },
        3: { repfirst: 1, firstsize: 1, repnext: 1, mulsize: 2 },
        5: { repfirst: 1, firstsize: 1, repnext: 1, mulsize: 4 }
    };

    this.levels = 1 << bpc;
    this.n_buckets_ptrs = 0;

    const config = EVOL_CONFIG[evol] || {};
    this.repfirst = config.repfirst !== undefined ? config.repfirst : 0;
    this.firstsize = config.firstsize !== undefined ? config.firstsize : 0;
    this.repnext = config.repnext !== undefined ? config.repnext : 0;
    this.mulsize = config.mulsize !== undefined ? config.mulsize : 0;

    if (evol === 0 || evol === 2 || evol === 4) {
        console.warn("quic: findmodelparams(): evol value obsolete!!!");
    } else if (!(evol in EVOL_CONFIG)) {
        console.error("quic: findmodelparams(): evol out of range!!!");
    }

    let repcntr = this.repfirst + 1;
    let bsize = this.firstsize;
    let bend = 0;
    let bstart;
    this.n_buckets = 0;

    const needSetPtrs = !this.n_buckets_ptrs;
    const levelLimit = this.levels - 1;

    do {
        bstart = this.n_buckets ? bend + 1 : 0;

        if (--repcntr === 0) {
            repcntr = this.repnext;
            bsize *= this.mulsize;
        }

        bend = bstart + bsize - 1;
        if (bend + bsize >= this.levels) {
            bend = levelLimit;
        }

        if (needSetPtrs && !this.n_buckets_ptrs) {
            this.n_buckets_ptrs = this.levels;
        }

        this.n_buckets++;
    } while (bend < levelLimit);
}

QuicModel.prototype = {
    n_buckets : 0,
    n_buckets_ptrs : 0,
    repfirst : 0,
    firstsize : 0,
    repnext : 0,
    mulsize : 0,
    levels : 0
};

function QuicBucket() {
    this.counters = new Uint32Array(8);
}

QuicBucket.prototype = {
    bestcode: 0,

    reste: function(bpp) {
        this.counters.fill(0);
        this.bestcode = bpp;
    },

    update_model_8bpc: function(state, curval, bpp) {
        const counters = this.counters;
        
        let bestcode = bpp - 1;
        let bestcodelen = counters[bestcode] += golomb_code_len_8bpc(curval, bestcode);
        
        for (let i = bpp - 2; i >= 0; i--) {
            const codelen = counters[i] += golomb_code_len_8bpc(curval, i);
            if (codelen < bestcodelen) {
                bestcode = i;
                bestcodelen = codelen;
            }
        }
        
        this.bestcode = bestcode;
        
        if (bestcodelen > state.wm_trigger) {
            if (typeof SIMD !== "undefined") {
                const vec = SIMD.Uint32x4.load(counters, 0);
                const shifted = SIMD.Uint32x4.shiftRightByVector(vec, 1);
                SIMD.Uint32x4.store(counters, 0, shifted);
            } else {
                for (let i = 0; i < bpp; i++) {
                    counters[i] >>>= 1;
                }
            }
        }
    }
};

function QuicFamilyStat()
{
    this.buckets_ptrs = [];
    this.buckets_buf = [];
}

QuicFamilyStat.prototype = {

    fill_model_structures : function(model)
    {
        var bstart;
        var bend = 0;
        var bnumber = 0;

        var repcntr = model.repfirst + 1;
        var bsize = model.firstsize;

        do {
            if (bnumber) {
                bstart = bend + 1;
            } else {
                bstart = 0;
            }

            if (!--repcntr) {
                repcntr = model.repnext;
                bsize *= model.mulsize;
            }

            bend = bstart + bsize - 1;
            if (bend + bsize >= model.levels) {
                bend = model.levels - 1;
            }

            this.buckets_buf[bnumber] = new QuicBucket;

            var i;
            for (i = bstart; i <= bend; i++) {
                this.buckets_ptrs[i] = this.buckets_buf[bnumber];
            }

            bnumber++;
        } while (bend < model.levels - 1);
        return true;
    }
}

function QuicChannel(model_8bpc, model_5bpc) {
    this.state = new CommonState();
    this.model_8bpc = model_8bpc;
    this.model_5bpc = model_5bpc;
    
    this.family_stat_8bpc = new QuicFamilyStat();
    this.family_stat_5bpc = new QuicFamilyStat();
    
    this.correlate_row = { 
        zero: 0,
        row: new Array(2048)
    };
    this.buckets_ptrs = [];

    if (!this.family_stat_8bpc.fill_model_structures(model_8bpc)) {
        console.error("Failed to initialize 8bpc model");
        return undefined;
    }
    
    if (!this.family_stat_5bpc.fill_model_structures(model_5bpc)) {
        console.error("Failed to initialize 5bpc model");
        return undefined;
    }
}

QuicChannel.prototype = {
    reste(bpc) {
        if (bpc !== 5 && bpc !== 8) {
            console.warn(`quic: ${this.reste.name}: bad bpc ${bpc}`);
            return false;
        }

        this.correlate_row.zero = 0;
        this.correlate_row.row.fill(0);

        const family = bpc === 8 ? this.family_stat_8bpc : this.family_stat_5bpc;
        const model = bpc === 8 ? this.model_8bpc : this.model_5bpc;
        
        if (bpc === 8) {
            for (let j = 0; j < model.n_buckets; j++) {
                family.buckets_buf[j]?.reste(7);
            }
        } else {
            for (let j = 0; j < model.n_buckets; j++) {
                family.buckets_buf[j]?.reste(4);
            }
        }
        
        this.buckets_ptrs = family.buckets_ptrs;
        
        this.state.reste();
        return true;
    }
};

const WM_DIV_EPOL = Math.floor(evol / 2)
const J0 = J[0]


function CommonState() {
    this.waitcnt = 0;
    this.tabrand_seed = 0xff;
    this.wm_trigger = besttrigtab[WM_DIV_EPOL][0];
    this.wmidx = 0;
    this.wmileft = wminext;
    this.melcstate = 0;
    this.melclen = J0;
    this.melcorder = 1 << J0;
}

CommonState.prototype = {
    set_wm_trigger() {
        const wm = Math.min(this.wmidx, Constants.MAX_WMIDX);
        this.wm_trigger = besttrigtab[WM_DIV_EPOL][wm];
    },
    
    reste() {
        this.waitcnt = 0;
        this.tabrand_seed = 0xff;
        this.wmidx = 0;
        this.wmileft = wminext;
        this.melcstate = 0;
        this.melclen = J0;
        this.melcorder = 1 << J0;
        this.set_wm_trigger();
    },
    
    tabrand() {
        return tabrand_chaos[++this.tabrand_seed & 0xff];
    }
};


function QuicEncoder() {
    this.rgb_state = new CommonState();
    this.model_8bpc = new QuicModel(8);
    this.model_5bpc = new QuicModel(5);
    this.channels = new Array(4);
    
    for (let i = 0; i < 4; i++) {
        this.channels[i] = new QuicChannel(this.model_8bpc, this.model_5bpc);
        if (!this.channels[i]) {
            console.error(`quic: failed to create channel ${i}`);
            return undefined;
        }
    }
}

QuicEncoder.prototype = {
    type: 0 | 0,
    width: 0 | 0,
    height: 0 | 0,
    io_idx: 0 | 0,
    io_available_bits: 0 | 0,
    io_word: 0 | 0,
    io_next_word: 0 | 0,
    io_now: null,
    io_end: 0 | 0,
    rows_completed: 0 | 0,

    reste(io_ptr) {
        this.rgb_state.reste();
        this.io_now = io_ptr;
        this.io_end = io_ptr.length;
        this.io_idx = 0 | 0;
        this.rows_completed = 0 | 0;
        return true;
    },

    read_io_word() {
        if (this.io_idx >= this.io_end) {
            throw "quic: out of data";
        }
        this.io_next_word = (
            this.io_now[this.io_idx++] |
            this.io_now[this.io_idx++] << 8 |
            this.io_now[this.io_idx++] << 16 |
            this.io_now[this.io_idx++] << 24
        );
    },

    decode_eatbits(len) {
        this.io_word = this.io_word << len;
        const delta = this.io_available_bits - len;
        
        if (delta >= 0) {
            this.io_available_bits = delta;
            this.io_word |= this.io_next_word >>> this.io_available_bits;
        } else {
            const shift = -delta;
            this.io_word |= this.io_next_word << shift;
            this.read_io_word();
            this.io_available_bits = 32 - shift;
            this.io_word |= this.io_next_word >>> this.io_available_bits;
        }
    },

    decode_eat32bits() {
        this.decode_eatbits(16);
        this.decode_eatbits(16);
    },

    reste_channels(bpc) {
        for (const channel of this.channels) {
            if (!channel?.reste(bpc)) return false;
        }
        return true;
    },

    quic_decode_begin(io_ptr) {
        if (!this.reste(io_ptr)) return false;
        this.read_io_word();
        this.io_word = this.io_next_word;
        this.io_available_bits = 0;

        const magic = this.io_word;
        this.decode_eat32bits();
        
        if (magic !== Constants.QUIC_MAGIC) {
            console.error("quic: bad magic", magic.toString(16));
            return false;
        }

        const version = this.io_word;
        this.decode_eat32bits();
        
        if (version !== Constants.DEFAULT_VERSION) {
            console.error("quic: bad version", version.toString(16));
            return false;
        }

        this.type = this.io_word;
        this.decode_eat32bits();
        this.width = this.io_word;
        this.decode_eat32bits();
        this.height = this.io_word;
        this.decode_eat32bits();

        const bpc = quic_image_bpc(this.type);
        return this.reste_channels(bpc);
    }
};


QuicEncoder.prototype.quic_rgb32_uncompress_row0_seg = function (i, cur_row, end,
                                       waitmask, bpc, bpc_mask)
{
    var stopidx;
    var n_channels = 3;
    var c;
    var a;

    if (!i) {
        cur_row[rgb32_pixel_pad] = 0;
        c = 0;
        do
        {
            a = golomb_decoding_8bpc(this.channels[c].buckets_ptrs[this.channels[c].correlate_row.zero].bestcode, this.io_word);
            this.channels[c].correlate_row.row[0] = a.rc;
            cur_row[2-c] = (family_8bpc.xlatL2U[a.rc]&0xFF);
            this.decode_eatbits(a.codewordlen);
        } while (++c < n_channels);

        if (this.rgb_state.waitcnt) {
            --this.rgb_state.waitcnt;
        } else {
            this.rgb_state.waitcnt = (this.rgb_state.tabrand() & waitmask);
            c = 0;
            do
            {
                this.channels[c].buckets_ptrs[this.channels[c].correlate_row.zero].update_model_8bpc(this.rgb_state, this.channels[c].correlate_row.row[0], bpc);
            } while (++c < n_channels);
        }
        stopidx = ++i + this.rgb_state.waitcnt;
    } else {
        stopidx = i + this.rgb_state.waitcnt;
    }

    while (stopidx < end) {
        for (; i <= stopidx; i++) {
            cur_row[(i* rgb32_pixel_size)+rgb32_pixel_pad] = 0;
            c = 0;
            do
            {
                a = golomb_decoding_8bpc(this.channels[c].buckets_ptrs[this.channels[c].correlate_row.row[i - 1]].bestcode, this.io_word);
                this.channels[c].correlate_row.row[i] = a.rc;
                cur_row[(i* rgb32_pixel_size)+(2-c)] = (family_8bpc.xlatL2U[a.rc] + cur_row[((i-1) * rgb32_pixel_size) + (2-c)]) & bpc_mask;
                this.decode_eatbits(a.codewordlen);
            } while (++c < n_channels);
        }
        c = 0;
        do
        {
            this.channels[c].buckets_ptrs[this.channels[c].correlate_row.row[stopidx - 1]].update_model_8bpc(this.rgb_state, this.channels[c].correlate_row.row[stopidx], bpc);
        } while (++c < n_channels);
        stopidx = i + (this.rgb_state.tabrand() & waitmask);
    }

    for (; i < end; i++) {
        cur_row[(i* rgb32_pixel_size)+rgb32_pixel_pad] = 0;
        c = 0;
        do
        {
            a = golomb_decoding_8bpc(this.channels[c].buckets_ptrs[this.channels[c].correlate_row.row[i - 1]].bestcode, this.io_word);
            this.channels[c].correlate_row.row[i] = a.rc;
            cur_row[(i* rgb32_pixel_size)+(2-c)] = (family_8bpc.xlatL2U[a.rc] + cur_row[((i-1) * rgb32_pixel_size) + (2-c)]) & bpc_mask;
            this.decode_eatbits(a.codewordlen);
        } while (++c < n_channels);
    }
    this.rgb_state.waitcnt = stopidx - end;
}

QuicEncoder.prototype.quic_rgb32_uncompress_row0 = function (cur_row)
{
    var bpc = 8;
    var bpc_mask = 0xff;
    var pos = 0;
    var width = this.width;

    while ((wmimax > this.rgb_state.wmidx) && (this.rgb_state.wmileft <= width)) {
        if (this.rgb_state.wmileft) {
            this.quic_rgb32_uncompress_row0_seg(pos, cur_row,
                                       pos + this.rgb_state.wmileft,
                                       bppmask[this.rgb_state.wmidx],
                                       bpc, bpc_mask);
            pos += this.rgb_state.wmileft;
            width -= this.rgb_state.wmileft;
        }

        this.rgb_state.wmidx++;
        this.rgb_state.set_wm_trigger();
        this.rgb_state.wmileft = wminext;
    }

    if (width) {
        this.quic_rgb32_uncompress_row0_seg(pos, cur_row, pos + width,
                                   bppmask[this.rgb_state.wmidx], bpc, bpc_mask);
        if (wmimax > this.rgb_state.wmidx) {
            this.rgb_state.wmileft -= width;
        }
    }
}

QuicEncoder.prototype.quic_rgb32_uncompress_row_seg = function( prev_row, cur_row, i, end, bpc, bpc_mask)
{
    var n_channels = 3;
    var waitmask = bppmask[this.rgb_state.wmidx];

    var a;
    var run_index = 0;
    var stopidx = 0;
    var run_end = 0;
    var c;

    if (!i)
    {
        cur_row[rgb32_pixel_pad] = 0;

        c = 0;
        do {
            a = golomb_decoding_8bpc(this.channels[c].buckets_ptrs[this.channels[c].correlate_row.zero].bestcode, this.io_word);
            this.channels[c].correlate_row.row[0] = a.rc;
            cur_row[2-c] = (family_8bpc.xlatL2U[this.channels[c].correlate_row.row[0]] + prev_row[2-c]) & bpc_mask;
            this.decode_eatbits(a.codewordlen);
        } while (++c < n_channels);

        if (this.rgb_state.waitcnt) {
            --this.rgb_state.waitcnt;
        } else {
            this.rgb_state.waitcnt = (this.rgb_state.tabrand() & waitmask);
            c = 0;
            do {
                this.channels[c].buckets_ptrs[this.channels[c].correlate_row.zero].update_model_8bpc(this.rgb_state, this.channels[c].correlate_row.row[0], bpc);
            } while (++c < n_channels);
        }
        stopidx = ++i + this.rgb_state.waitcnt;
    } else {
        stopidx = i + this.rgb_state.waitcnt;
    }
    for (;;) {
        var rc = 0;
        while (stopidx < end && !rc) {
            for (; i <= stopidx && !rc; i++) {
                var pixel = i * rgb32_pixel_size;
                var pixelm1 = (i-1) * rgb32_pixel_size;
                var pixelm2 = (i-2) * rgb32_pixel_size;

                if ( prev_row[pixelm1+rgb32_pixel_r] == prev_row[pixel+rgb32_pixel_r] && prev_row[pixelm1+rgb32_pixel_g] == prev_row[pixel+rgb32_pixel_g] && prev_row[pixelm1 + rgb32_pixel_b] == prev_row[pixel+rgb32_pixel_b])
                {
                    if (run_index != i && i > 2 && (cur_row[pixelm1+rgb32_pixel_r] == cur_row[pixelm2+rgb32_pixel_r] && cur_row[pixelm1+rgb32_pixel_g] == cur_row[pixelm2+rgb32_pixel_g] && cur_row[pixelm1+rgb32_pixel_b] == cur_row[pixelm2+rgb32_pixel_b]))
                    {
                        /* do run */
                        this.rgb_state.waitcnt = stopidx - i;
                        run_index = i;
                        run_end = i + this.decode_run(this.rgb_state);

                        for (; i < run_end; i++) {
                            var pixel = i * rgb32_pixel_size;
                            var pixelm1 = (i-1) * rgb32_pixel_size;
                            cur_row[pixel+rgb32_pixel_pad] = 0;
                            cur_row[pixel+rgb32_pixel_r] = cur_row[pixelm1+rgb32_pixel_r];
                            cur_row[pixel+rgb32_pixel_g] = cur_row[pixelm1+rgb32_pixel_g];
                            cur_row[pixel+rgb32_pixel_b] = cur_row[pixelm1+rgb32_pixel_b];
                        }

                        if (i == end) {
                            return;
                        }
                        else
                        {
                            stopidx = i + this.rgb_state.waitcnt;
                            rc = 1;
                            break;
                        }
                    }
                }

                c = 0;
                cur_row[pixel+rgb32_pixel_pad] = 0;
                do {
                    var cc = this.channels[c];
                    var cr = cc.correlate_row;

                    a = golomb_decoding_8bpc(cc.buckets_ptrs[cr.row[i-1]].bestcode, this.io_word);
                    cr.row[i] = a.rc;
                cur_row[pixel+(2-c)] = (family_8bpc.xlatL2U[a.rc] + ((cur_row[pixelm1+(2-c)] + prev_row[pixel+(2-c)]) >> 1)) & bpc_mask;
                    this.decode_eatbits(a.codewordlen);
                } while (++c < n_channels);
            }
            if (rc)
                break;

            c = 0;
            do {
                this.channels[c].buckets_ptrs[this.channels[c].correlate_row.row[stopidx - 1]].update_model_8bpc(this.rgb_state, this.channels[c].correlate_row.row[stopidx], bpc);
            } while (++c < n_channels);

            stopidx = i + (this.rgb_state.tabrand() & waitmask);
        }

        for (; i < end && !rc; i++) {
            var pixel = i * rgb32_pixel_size;
            var pixelm1 = (i-1) * rgb32_pixel_size;
            var pixelm2 = (i-2) * rgb32_pixel_size;

            if (prev_row[pixelm1+rgb32_pixel_r] == prev_row[pixel+rgb32_pixel_r] && prev_row[pixelm1+rgb32_pixel_g] == prev_row[pixel+rgb32_pixel_g] && prev_row[pixelm1+rgb32_pixel_b] == prev_row[pixel+rgb32_pixel_b])
            {
                if (run_index != i && i > 2 && (cur_row[pixelm1+rgb32_pixel_r] == cur_row[pixelm2+rgb32_pixel_r] && cur_row[pixelm1+rgb32_pixel_g] == cur_row[pixelm2+rgb32_pixel_g] && cur_row[pixelm1+rgb32_pixel_b] == cur_row[pixelm2+rgb32_pixel_b]))
                {
                    /* do run */
                    this.rgb_state.waitcnt = stopidx - i;
                    run_index = i;
                    run_end = i + this.decode_run(this.rgb_state);

                    for (; i < run_end; i++) {
                        var pixel = i * rgb32_pixel_size;
                        var pixelm1 = (i-1) * rgb32_pixel_size;
                        cur_row[pixel+rgb32_pixel_pad] = 0;
                        cur_row[pixel+rgb32_pixel_r] = cur_row[pixelm1+rgb32_pixel_r];
                        cur_row[pixel+rgb32_pixel_g] = cur_row[pixelm1+rgb32_pixel_g];
                        cur_row[pixel+rgb32_pixel_b] = cur_row[pixelm1+rgb32_pixel_b];
                    }

                    if (i == end) {
                        return;
                    }
                    else
                    {
                        stopidx = i + this.rgb_state.waitcnt;
                        rc = 1;
                        break;
                    }
                }
            }

            cur_row[pixel+rgb32_pixel_pad] = 0;
            c = 0;
            do
            {
                a = golomb_decoding_8bpc(this.channels[c].buckets_ptrs[this.channels[c].correlate_row.row[i-1]].bestcode, this.io_word);
                this.channels[c].correlate_row.row[i] = a.rc;
                cur_row[pixel+(2-c)] = (family_8bpc.xlatL2U[a.rc] + ((cur_row[pixelm1+(2-c)] + prev_row[pixel+(2-c)]) >> 1)) & bpc_mask;
                this.decode_eatbits(a.codewordlen);
            } while (++c < n_channels);
        }

          if (!rc)
          {
            this.rgb_state.waitcnt = stopidx - end;
            return;
          }
        }
}

QuicEncoder.prototype.decode_run = function(state)
{
    var runlen = 0;

    do {
        var hits;
        var x = (~(this.io_word >>> 24)>>>0)&0xff;
        var temp = zeroLUT[x];

        for (hits = 1; hits <= temp; hits++) {
            runlen += state.melcorder;

            if (state.melcstate < 32) {
                state.melclen = J[++state.melcstate];
                state.melcorder = (1 << state.melclen);
            }
        }
        if (temp != 8) {
            this.decode_eatbits(temp + 1);

            break;
        }
        this.decode_eatbits(8);
    } while (true);

    if (state.melclen) {
        runlen += this.io_word >>> (32 - state.melclen);
        this.decode_eatbits(state.melclen);
    }

    if (state.melcstate) {
        state.melclen = J[--state.melcstate];
        state.melcorder = (1 << state.melclen);
    }

    return runlen;
}

QuicEncoder.prototype.quic_rgb32_uncompress_row = function (prev_row, cur_row)
{
    var bpc = 8;
    var bpc_mask = 0xff;
    var pos = 0;
    var width = this.width;

    while ((wmimax > this.rgb_state.wmidx) && (this.rgb_state.wmileft <= width)) {
        if (this.rgb_state.wmileft) {
            this.quic_rgb32_uncompress_row_seg(prev_row, cur_row, pos,
                                      pos + this.rgb_state.wmileft, bpc, bpc_mask);
            pos += this.rgb_state.wmileft;
            width -= this.rgb_state.wmileft;
        }

        this.rgb_state.wmidx++;
        this.rgb_state.set_wm_trigger();
        this.rgb_state.wmileft = wminext;
    }

    if (width) {
        this.quic_rgb32_uncompress_row_seg(prev_row, cur_row, pos,
                                  pos + width, bpc, bpc_mask);
        if (wmimax > this.rgb_state.wmidx) {
            this.rgb_state.wmileft -= width;
        }
    }
}

QuicEncoder.prototype.quic_four_uncompress_row0_seg = function (channel, i,
                                       correlate_row, cur_row, end, waitmask,
                                       bpc, bpc_mask)
{
    var stopidx;
    var a;

    if (i == 0) {
        a = golomb_decoding_8bpc(channel.buckets_ptrs[correlate_row.zero].bestcode, this.io_word);
        correlate_row.row[0] = a.rc;
        cur_row[rgb32_pixel_pad] = family_8bpc.xlatL2U[a.rc];
        this.decode_eatbits(a.codewordlen);

        if (channel.state.waitcnt) {
            --channel.state.waitcnt;
        } else {
            channel.state.waitcnt = (channel.state.tabrand() & waitmask);
            channel.buckets_ptrs[correlate_row.zero].update_model_8bpc(channel.state, correlate_row.row[0], bpc);
        }
        stopidx = ++i + channel.state.waitcnt;
    } else {
        stopidx = i + channel.state.waitcnt;
    }

    while (stopidx < end) {
        var pbucket;

        for (; i <= stopidx; i++) {
            pbucket = channel.buckets_ptrs[correlate_row.row[i - 1]];

            a = golomb_decoding_8bpc(pbucket.bestcode, this.io_word);
            correlate_row.row[i] = a.rc;
            cur_row[(i*rgb32_pixel_size)+rgb32_pixel_pad] = (family_8bpc.xlatL2U[a.rc] + cur_row[((i-1)*rgb32_pixel_size)+rgb32_pixel_pad]) & bpc_mask;
            this.decode_eatbits(a.codewordlen);
        }

        pbucket.update_model_8bpc(channel.state, correlate_row.row[stopidx], bpc);

        stopidx = i + (channel.state.tabrand() & waitmask);
    }

    for (; i < end; i++) {
        a = golomb_decoding_8bpc(channel.buckets_ptrs[correlate_row.row[i-1]].bestcode, this.io_word);

        correlate_row.row[i] = a.rc;
        cur_row[(i*rgb32_pixel_size)+rgb32_pixel_pad] = (family_8bpc.xlatL2U[a.rc] + cur_row[((i-1)*rgb32_pixel_size)+rgb32_pixel_pad]) & bpc_mask;
        this.decode_eatbits(a.codewordlen);
    }
    channel.state.waitcnt = stopidx - end;
}

QuicEncoder.prototype.quic_four_uncompress_row0 = function(channel, cur_row) {
    const bpc = 8;
    const bpc_mask = 0xff;
    const correlate_row = channel.correlate_row;
    let pos = 0;
    let width = this.width;

    while (wmimax > channel.state.wmidx && channel.state.wmileft <= width) {
        if (channel.state.wmileft) {
            this.quic_four_uncompress_row0_seg(
                channel, 
                pos, 
                correlate_row, 
                cur_row,
                pos + channel.state.wmileft, 
                bppmask[channel.state.wmidx],
                bpc, 
                bpc_mask
            );
            pos += channel.state.wmileft;
            width -= channel.state.wmileft;
        }

        channel.state.wmidx++;
        channel.state.set_wm_trigger();
        channel.state.wmileft = wminext;
    }

    if (width) {
        this.quic_four_uncompress_row0_seg(
            channel, 
            pos, 
            correlate_row, 
            cur_row, 
            pos + width,
            bppmask[channel.state.wmidx], 
            bpc, 
            bpc_mask
        );
        if (wmimax > channel.state.wmidx) {
            channel.state.wmileft -= width;
        }
    }
}


QuicEncoder.prototype.quic_four_uncompress_row_seg = function (channel,
                                      correlate_row, prev_row, cur_row, i,
                                      end, bpc, bpc_mask)
{
    var waitmask = bppmask[channel.state.wmidx];
    var stopidx;

    var run_index = 0;
    var run_end;

    var a;

    if (i == 0) {
        a = golomb_decoding_8bpc(channel.buckets_ptrs[correlate_row.zero].bestcode, this.io_word);

        correlate_row.row[0] = a.rc
        cur_row[rgb32_pixel_pad] = (family_8bpc.xlatL2U[a.rc] + prev_row[rgb32_pixel_pad]) & bpc_mask;
        this.decode_eatbits(a.codewordlen);

        if (channel.state.waitcnt) {
            --channel.state.waitcnt;
        } else {
            channel.state.waitcnt = (channel.state.tabrand() & waitmask);
            channel.buckets_ptrs[correlate_row.zero].update_model_8bpc(channel.state, correlate_row.row[0], bpc);
        }
        stopidx = ++i + channel.state.waitcnt;
    } else {
        stopidx = i + channel.state.waitcnt;
    }
    for (;;) {
        var rc = 0;
        while (stopidx < end && !rc) {
            var pbucket;
            for (; i <= stopidx && !rc; i++) {
                var pixel = i * rgb32_pixel_size;
                var pixelm1 = (i-1) * rgb32_pixel_size;
                var pixelm2 = (i-2) * rgb32_pixel_size;

                if (prev_row[pixelm1+rgb32_pixel_pad] == prev_row[pixel+rgb32_pixel_pad])
                {
                    if (run_index != i && i > 2 && cur_row[pixelm1+rgb32_pixel_pad] == cur_row[pixelm2+rgb32_pixel_pad])
                    {
                        /* do run */
                        channel.state.waitcnt = stopidx - i;
                        run_index = i;

                        run_end = i + this.decode_run(channel.state);

                        for (; i < run_end; i++) {
                            var pixel = i * rgb32_pixel_size;
                            var pixelm1 = (i-1) * rgb32_pixel_size;
                            cur_row[pixel+rgb32_pixel_pad] = cur_row[pixelm1+rgb32_pixel_pad];
                        }

                        if (i == end) {
                            return;
                        }
                        else
                        {
                            stopidx = i + channel.state.waitcnt;
                            rc = 1;
                            break;
                        }
                    }
                }

                pbucket = channel.buckets_ptrs[correlate_row.row[i - 1]];
                a = golomb_decoding_8bpc(pbucket.bestcode, this.io_word);
                correlate_row.row[i] = a.rc
                cur_row[pixel+rgb32_pixel_pad] = (family_8bpc.xlatL2U[a.rc] + ((cur_row[pixelm1+rgb32_pixel_pad] + prev_row[pixel+rgb32_pixel_pad]) >> 1)) & bpc_mask;
                this.decode_eatbits(a.codewordlen);
            }
            if (rc)
                break;

            pbucket.update_model_8bpc(channel.state, correlate_row.row[stopidx], bpc);

            stopidx = i + (channel.state.tabrand() & waitmask);
        }

        for (; i < end && !rc; i++) {
            var pixel = i * rgb32_pixel_size;
            var pixelm1 = (i-1) * rgb32_pixel_size;
            var pixelm2 = (i-2) * rgb32_pixel_size;
            if (prev_row[pixelm1+rgb32_pixel_pad] == prev_row[pixel+rgb32_pixel_pad])
            {
                if (run_index != i && i > 2 && cur_row[pixelm1+rgb32_pixel_pad] == cur_row[pixelm2+rgb32_pixel_pad])
                {
                    /* do run */
                    channel.state.waitcnt = stopidx - i;
                    run_index = i;

                    run_end = i + this.decode_run(channel.state);

                    for (; i < run_end; i++) {
                        var pixel = i * rgb32_pixel_size;
                        var pixelm1 = (i-1) * rgb32_pixel_size;
                        cur_row[pixel+rgb32_pixel_pad] = cur_row[pixelm1+rgb32_pixel_pad];
                    }

                    if (i == end) {
                        return;
                    }
                    else
                    {
                        stopidx = i + channel.state.waitcnt;
                        rc = 1;
                        break;
                    }
                }
            }

            a = golomb_decoding_8bpc(channel.buckets_ptrs[correlate_row.row[i-1]].bestcode, this.io_word);
            correlate_row.row[i] = a.rc;
            cur_row[pixel+rgb32_pixel_pad] = (family_8bpc.xlatL2U[a.rc] + ((cur_row[pixelm1+rgb32_pixel_pad] + prev_row[pixel+rgb32_pixel_pad]) >> 1)) & bpc_mask;
            this.decode_eatbits(a.codewordlen);
        }

        if (!rc)
        {
            channel.state.waitcnt = stopidx - end;
            return;
        }
    }
}

QuicEncoder.prototype.quic_four_uncompress_row = function(channel, prev_row, cur_row) {
    const bpc = 8;
    const bpc_mask = 0xff;
    const correlate_row = channel.correlate_row;
    let pos = 0;
    let width = this.width;

    while (wmimax > channel.state.wmidx && channel.state.wmileft <= width) {
        if (channel.state.wmileft) {
            this.quic_four_uncompress_row_seg(channel, correlate_row, prev_row, cur_row, pos, pos + channel.state.wmileft, bpc, bpc_mask);
            pos += channel.state.wmileft;
            width -= channel.state.wmileft;
        }

        channel.state.wmidx++;
        channel.state.set_wm_trigger();
        channel.state.wmileft = wminext;
    }

    if (width > 0) {
        this.quic_four_uncompress_row_seg(channel, correlate_row, prev_row, cur_row, pos, pos + width, bpc, bpc_mask);
        if (wmimax > channel.state.wmidx) {
            channel.state.wmileft -= width;
        }
    }
}

/* We need to be generating rgb32 or rgba */
QuicEncoder.prototype.quic_decode = function(buf, stride) {
    const { type, height, channels } = this;
    const correlateZeroReset = () => {
        channels.forEach(channel => {
            channel.correlate_row.zero = 0;
        });
    };

    const updateCorrelateRowZero = (channel) => {
        channel.correlate_row.zero = channel.correlate_row.row[0];
    };

    const handleRGB32OrRGBA = (hasAlpha) => {
        correlateZeroReset();
        this.quic_rgb32_uncompress_row0(buf);

        if (hasAlpha) {
            channels[3].correlate_row.zero = 0;
            this.quic_four_uncompress_row0(channels[3], buf);
        }

        this.rows_completed++;
        for (let row = 1; row < height; row++) {
            let prev = buf;
            buf = prev.subarray(stride);

            channels.slice(0, 3).forEach(updateCorrelateRowZero);
            this.quic_rgb32_uncompress_row(prev, buf);

            if (hasAlpha) {
                updateCorrelateRowZero(channels[3]);
                this.quic_four_uncompress_row(channels[3], prev, buf);
            }

            this.rows_completed++;
        }
    };

    switch (type) {
        case Constants.QUIC_IMAGE_TYPE_RGB32:
        case Constants.QUIC_IMAGE_TYPE_RGB24:
            handleRGB32OrRGBA(false);
            break;

        case Constants.QUIC_IMAGE_TYPE_RGBA:
            handleRGB32OrRGBA(true);
            break;

        case Constants.QUIC_IMAGE_TYPE_RGB16:
        case Constants.QUIC_IMAGE_TYPE_GRAY:
            console.log("quic: unsupported output format\n");
            return false;

        case Constants.QUIC_IMAGE_TYPE_INVALID:
        default:
            console.log("quic: bad image type\n");
            return false;
    }

    return true;
};


QuicEncoder.prototype.simple_quic_decode = function(buf) {
    const stride = 4;  // FIXME - proper stride calculation should be applied
    if (!this.quic_decode_begin(buf)) {
        return undefined;
    }

    const validTypes = [
        Constants.QUIC_IMAGE_TYPE_RGB32,
        Constants.QUIC_IMAGE_TYPE_RGB24,
        Constants.QUIC_IMAGE_TYPE_RGBA
    ];

    if (!validTypes.includes(this.type)) {
        return undefined;
    }

    const width = this.width;
    const height = this.height;
    const outLength = width * height * stride;

    const out = new Uint8Array(outLength);
    out[0] = 69;  

    const decoded = this.quic_decode(out, width * stride);

    return decoded ? out : undefined;
};


function SpiceQuic()
{
}

SpiceQuic.prototype =
{
    from_dv: function(dv, at, mb)
    {
        if (!encoder)
            throw("quic: no quic encoder");
        this.data_size = dv.getUint32(at, true);
        at += 4;
        var buf = new Uint8Array(mb.slice(at));
        this.outptr = encoder.simple_quic_decode(buf);
        if (this.outptr)
        {
            this.type = encoder.type;
            this.width = encoder.width;
            this.height = encoder.height;
        }
        at += buf.length;
        return at;
    },
}

function convert_spice_quic_to_web(context, spice_quic) {
    const width = spice_quic.width;
    const height = spice_quic.height;
    const ret = context.createImageData(width, height);
    const outptr = spice_quic.outptr;
    const retData = ret.data;
    
    const pixelCount = width * height;
    const isRGBA = spice_quic.type === Constants.QUIC_IMAGE_TYPE_RGBA;
    
    for (let i = 0, len = pixelCount * 4; i < len; i += 4) {
        retData[i]     = outptr[i + 2]; // R
        retData[i + 1] = outptr[i + 1]; // G
        retData[i + 2] = outptr[i];     // B
        
        retData[i + 3] = isRGBA ? (255 - outptr[i + 3]) : 255;
    }
    
    return ret;
}

/* Module initialization */
if (need_init) {
    need_init = false;
    family_init(family_8bpc, 8, DEFmaxclen);
    family_init(family_5bpc, 5, DEFmaxclen);
    
    for (let i = 0; i < 256; i++) {
        zeroLUT[i] = Math.clz32(i) - 24;
    }
    
    encoder = new QuicEncoder();
    if (!encoder) {
        throw new Error("quic: failed to create encoder");
    }
}

export {
  Constants,
  SpiceQuic,
  convert_spice_quic_to_web,
};
