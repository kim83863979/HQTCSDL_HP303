const IMAGE_MAX_BYTES = 5 * 1024 * 1024;

const IMAGE_FORMATS = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

function inspectProductImage(buffer, contentType) {
  const extension = IMAGE_FORMATS[contentType];
  if (!extension) {
    const error = new Error('Ảnh phải có định dạng JPG, JPEG, PNG hoặc WEBP.');
    error.status = 415;
    error.code = 'UNSUPPORTED_IMAGE_TYPE';
    throw error;
  }
  if (!Buffer.isBuffer(buffer) || buffer.length === 0 || buffer.length > IMAGE_MAX_BYTES) {
    const error = new Error('Ảnh phải có dung lượng lớn hơn 0 và không vượt quá 5 MB.');
    error.status = 413;
    error.code = 'INVALID_IMAGE_SIZE';
    throw error;
  }

  const isJpeg = extension === 'jpg'
    && buffer.length >= 4
    && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff
    && buffer[buffer.length - 2] === 0xff && buffer[buffer.length - 1] === 0xd9;
  const isPng = extension === 'png'
    && buffer.length >= 24
    && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    && buffer.toString('ascii', 12, 16) === 'IHDR'
    && buffer.length >= 33
    && buffer.toString('ascii', buffer.length - 8, buffer.length - 4) === 'IEND';
  const isWebp = extension === 'webp'
    && buffer.length >= 16
    && buffer.toString('ascii', 0, 4) === 'RIFF'
    && buffer.toString('ascii', 8, 12) === 'WEBP'
    && buffer.readUInt32LE(4) + 8 === buffer.length
    && ['VP8 ', 'VP8L', 'VP8X'].includes(buffer.toString('ascii', 12, 16));

  if (!isJpeg && !isPng && !isWebp) {
    const error = new Error('Nội dung tệp không khớp với định dạng ảnh đã chọn.');
    error.status = 400;
    error.code = 'INVALID_IMAGE_CONTENT';
    throw error;
  }
  return { extension };
}

module.exports = { IMAGE_MAX_BYTES, inspectProductImage };
