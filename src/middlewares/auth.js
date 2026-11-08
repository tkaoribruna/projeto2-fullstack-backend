const jwt = require('jsonwebtoken');
 
function autenticar(req, res, next) {
  const [esquema, token] = (req.headers.authorization ?? '').split(' ');
  if (esquema !== 'Bearer' || !token) {
    return res.status(401).json({ erro: 'Token não informado.' });
  }
  if (!process.env.JWT_SECRET) {
    return next(new Error('JWT_SECRET não configurado no .env'));
  }
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.usuarioId = Number(payload.sub); 
    return next();
  } catch {
    return res.status(401).json({ erro: 'Token inválido ou expirado.' });
  }
}
 
module.exports = autenticar;
 
