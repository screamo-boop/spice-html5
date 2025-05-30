"use strict";
/*
   Copyright (C) 2014 Red Hat, Inc.

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

function SpiceFileXferTask(id, file)
{
    this.id = id;
    this.file = file;
}

SpiceFileXferTask.prototype.create_progressbar = function()
{
    var _this = this;
    var cancel = document.createElement("input");
    this.progressbar_container = document.createElement("div");
    this.progressbar = document.createElement("progress");

    cancel.type = 'button';
    cancel.value = 'Cancel';
    cancel.style.float = 'right';
    cancel.onclick = function()
    {
        _this.cancelled = true;
        _this.remove_progressbar();
    };

    this.progressbar_container.style.position = 'fixed';
    this.progressbar_container.style.top = '20px';
    this.progressbar_container.style.right = '20px';
    this.progressbar_container.style.zIndex = '10000';
    this.progressbar_container.style.background = 'rgba(255, 255, 255, 0.9)';
    this.progressbar_container.style.padding = '10px';
    this.progressbar_container.style.borderRadius = '5px';
    this.progressbar_container.style.boxShadow = '0 2px 5px rgba(0,0,0,0.2)';

    this.progressbar.setAttribute('max', this.file.size);
    this.progressbar.setAttribute('value', 0);
    this.progressbar.style.width = '300px';
    this.progressbar.style.margin = '4px 0';

    this.progressbar_container.textContent = this.file.name;
    this.progressbar_container.appendChild(cancel);
    this.progressbar_container.appendChild(this.progressbar);
    
    document.body.appendChild(this.progressbar_container);
}

SpiceFileXferTask.prototype.show_message = function(message, is_error) {
    while (this.progressbar_container.firstChild) {
        this.progressbar_container.removeChild(this.progressbar_container.firstChild);
    }

    const msgDiv = document.createElement("div");
    const okButton = document.createElement("button");
    okButton.textContent = 'OK';
    okButton.style.float = 'right';
    okButton.onclick = () => this.remove_progressbar();

    this.progressbar_container.style.background = is_error ? '#fee' : '#dfd';
    msgDiv.style.color = is_error ? '#d00' : '#080';
    msgDiv.style.padding = '8px';
    msgDiv.style.marginRight = '60px';
    msgDiv.innerHTML = `<b>${is_error ? '❌ Error:' : '✅ Success:'}</b> ${message}`;

    this.progressbar_container.appendChild(msgDiv);
    this.progressbar_container.appendChild(okButton);
};

SpiceFileXferTask.prototype.remove_progressbar = function() {
    if (this.progressbar_container && this.progressbar_container.parentNode) {
        this.progressbar_container.parentNode.removeChild(this.progressbar_container);
    }
};

SpiceFileXferTask.prototype.update_progressbar = function(value)
{
    this.progressbar.setAttribute('value', value);
}

SpiceFileXferTask.prototype.remove_progressbar = function()
{
    if (this.progressbar_container && this.progressbar_container.parentNode)
        this.progressbar_container.parentNode.removeChild(this.progressbar_container);
}

function handle_file_dragover(e)
{
    e.stopPropagation();
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
}

function handle_file_drop(e)
{
    var sc = window.spice_connection;
    var files = e.dataTransfer.files;

    e.stopPropagation();
    e.preventDefault();
    for (var i = files.length - 1; i >= 0; i--)
    {
            sc.file_xfer_start(files[i]);
    }

}

export {
  SpiceFileXferTask,
  handle_file_dragover,
  handle_file_drop,
};
