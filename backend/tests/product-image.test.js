const assert = require('node:assert/strict');
const { describe, it } = require('node:test');
const { IMAGE_MAX_BYTES, inspectProductImage } = require('../src/modules/products/product-image');

describe('Product image validation', () => {
  it('accepts JPEG, PNG and WEBP signatures matching their declared MIME type', () => {
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0x00, 0xff, 0xd9]);
    const png = Buffer.alloc(33);
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(png);
    png.write('IHDR', 12, 'ascii');
    png.write('IEND', 25, 'ascii');
    const webp = Buffer.alloc(16);
    webp.write('RIFF', 0, 'ascii');
    webp.writeUInt32LE(8, 4);
    webp.write('WEBP', 8, 'ascii');
    webp.write('VP8 ', 12, 'ascii');

    assert.equal(inspectProductImage(jpeg, 'image/jpeg').extension, 'jpg');
    assert.equal(inspectProductImage(png, 'image/png').extension, 'png');
    assert.equal(inspectProductImage(webp, 'image/webp').extension, 'webp');
  });

  it('rejects MIME spoofing, unsupported types and invalid sizes', () => {
    assert.throws(
      () => inspectProductImage(Buffer.from('not an image'), 'image/jpeg'),
      { code: 'INVALID_IMAGE_CONTENT' },
    );
    assert.throws(
      () => inspectProductImage(Buffer.from([1]), 'image/gif'),
      { code: 'UNSUPPORTED_IMAGE_TYPE' },
    );
    assert.throws(
      () => inspectProductImage(Buffer.alloc(IMAGE_MAX_BYTES + 1), 'image/png'),
      { code: 'INVALID_IMAGE_SIZE' },
    );
  });
});
