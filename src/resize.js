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
**  resize.js
**      This bit of Javascript is a set of logic to help with window
**  resizing, using the agent channel to request screen resizes.
**
**  It's a bit tricky, as we want to wait for resizing to settle down
**  before sending a size.  Further, while horizontal resizing to use the whole
**  browser width is fairly easy to arrange with css, resizing an element to use
**  the whole vertical space (or to force a middle div to consume the bulk of the browser
**  window size) is tricky, and the consensus seems to be that Javascript is
**  the only right way to do it.
**--------------------------------------------------------------------------*/

function resizeHelper(sc) {
    const screenElement = document.getElementById(sc.screen_id);
    const messageElement = document.getElementById(sc.message_id);

    let width = screenElement.clientWidth;
    let height = window.innerHeight - 20;

    if (messageElement) {
        const messageStyle = window.getComputedStyle(messageElement);
        if (messageStyle.getPropertyValue("display") === 'none') {
            height -= parseInt(messageStyle.getPropertyValue("height"), 10);
        } else {
            height -= messageElement.offsetHeight;
        }
    }

    width -= width % 8;
    height -= height % 8;

    sc.resize_window(0, width, height, 32, 0, 0);
    sc.spice_resize_timer = undefined;
}

function handleResize() {
    const sc = window.spice_connection;
    if (sc) {
        if (sc.spice_resize_timer) {
            window.clearTimeout(sc.spice_resize_timer);
        }
        sc.spice_resize_timer = window.setTimeout(resizeHelper, 200, sc);
    }
}

export {
    resizeHelper as resize_helper,
    handleResize as handle_resize,
};
