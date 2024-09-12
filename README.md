# Spice Javascript client

Instructions and status as of August, 2024.

Development is carried out to optimize the quic protocol, other image compression protocols **HAVE NOT BEEN TESTED**

What problems have been solved so far:

* Improved QUIC image perfomance
* Fixed sendCtrlAltDel()
* Fixed CapsLock
* Fixed file transfer
* Removed unnecessary logs
* Optimized resizing
* Optimized spiceDataView
* Migrated to native DataView where it possible
* Clipboard copypaste (typing simulation)
* Buttons for ctrl+alt+f*

I use firefox as my main browser, all tests happen on it

## Requirements:

  1.  Modern Firefox or Chrome (IE will work, but badly)

  2.  ~~A WebSocket proxy~~

      ~~websockify:~~
        ~~https://github.com/kanaka/websockify~~
      ~~works great.~~

      ~~Note that a patch to remove this requirement has been submitted
      to the Spice project but not yet been accepted.  Refer to this email:
      https://lists.freedesktop.org/archives/spice-devel/2016-June/030552.html~~

      libvirt/qemu are able to form a suitable connection without the need to wrap it in a websocket proxy

  4.  A spice server


## Optional:
  1.  A web server

      With firefox, you can just open file:///your-path-to-spice.html-here

      With Chrome, you have to set a secret config flag to do that, or
      serve the files from a web server.


## Steps:

  1.  Start the spice server

  2.  ~~Start websockify; my command line looks like this:~~
       ~~./websockify 5959 localhost:5900~~

  3.  Fire up spice.html, set host + port + password, and click start


## Status:

  The TODO file should be a fairly comprehensive list of tasks
  required to make this client more fully functional.
