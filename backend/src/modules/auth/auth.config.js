const DEVELOPMENT_JWT_SECRET = 'freshvend_dev_secret_change_in_production';

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (process.env.NODE_ENV === 'production'
      && (!secret || secret === DEVELOPMENT_JWT_SECRET)) {
    throw new Error('JWT_SECRET phải được cấu hình an toàn trong môi trường production.');
  }
  return secret || DEVELOPMENT_JWT_SECRET;
}

module.exports = { getJwtSecret };
