function mockAuth(req, res, next) {
  const id = req.header("x-user-id") || null;
  const role = req.header("x-user-role") || null;

  req.user = {
    id,
    role,
  };

  next();
}

module.exports = { mockAuth };

