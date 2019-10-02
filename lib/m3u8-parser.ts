const Writable = require('stream').Writable;


/**
 * A very simple m3u8 playlist file parser that detects tags and segments.
 *
 * @extends WritableStream
 * @constructor
 */
module.exports = class m3u8Parser extends Writable {
  constructor() {
    super();
    this._waitForKey = false
    this._lastByte = 0
    this._byteRangeStart = 0
    this._byteRangeEnd = 0
    this._lastLine = '';
    this._seq = 0;
    this._nextItemDuration = null;
    this.on('finish', () => {
      this._parseLine(this._lastLine);
      if (this._waitForKey) {
       this.on('keyacquired', function () {
        this.emit('end')})
      } else {
       this.emit('end');
      }
    });
  }

  _parseLine(line) {
    let match = line.match(/^#(EXT[A-Z0-9-]+)(?::(.*))?/);
    if (match) {
      // This is a tag.
      const tag = match[1];
      const value = match[2] || null;
      switch (tag) {
        case 'EXT-X-BYTERANGE':
         {
          let valueArr = value.split('@')
          if (valueArr[1] !== undefined) this._lastByte = +valueArr[1]
          this._byteRangeStart = this._lastByte
          this._byteRangeEnd = this._lastByte + +valueArr[0]
          this._lastByte = this._byteRangeEnd + 1
         }
         break
        case 'EXT-X-KEY':
         {
          let valueArr = value.split(',')
          let method = valueArr[0].split('=')[1].trim()
          let keyfilename = valueArr[1].split('=')[1].replace(/"/g, '')
          this._waitForKey = true
          this.emit('keyfile', method, keyfilename)
         }
         break
        case 'EXT-X-PROGRAM-DATE-TIME':
          this.emit('starttime', new Date(value).getTime());
          break;
        case 'EXT-X-MEDIA-SEQUENCE':
          this._seq = parseInt(value);
          break;
        case 'EXTINF':
          this._nextItemDuration =
            Math.round(parseFloat(value.split(',')[0]) * 1000);
          break;
        case 'EXT-X-ENDLIST':
          this.emit('endlist');
          break;
      }

    } else if (!/^#/.test(line) && line.trim()) {
      // This is a segment
      this.emit('item', {
        url: line.trim(),
        seq: this._seq++,
        byteRangeStart: this._byteRangeStart,
        byteRangeEnd: this._byteRangeEnd,
        duration: this._nextItemDuration,
      });
      this._byteRangeStart = undefined
      this._byteRangeEnd = undefined
    }
  }

  _write(chunk, encoding, callback) {
    let lines = chunk.toString('utf8').split('\n');
    if (this._lastLine) { lines[0] = this._lastLine + lines[0]; }
    lines.forEach((line, i) => {
      if (i < lines.length - 1) {
        this._parseLine(line);
      } else {
        // Save the last line in case it has been broken up.
        this._lastLine = line;
      }
    });
    callback();
  }
};
