const {
  processAndSaveOwnerImage,
  processAndSaveOwnerPromoImage,
  processAndSaveOwnerCatalogImage,
} = require("../../../utils/processImage");

async function uploadOwnerImage(req, res) {
  try {
    const ownerId = req.user?.id;
    if (!ownerId) {
      return res.status(401).json({ error: "Owner authentication required" });
    }
    if (!req.file?.buffer) {
      return res.status(400).json({ error: 'Missing file field "file"' });
    }

    const result = await processAndSaveOwnerImage(ownerId, req.file.buffer);
    return res.status(201).json({
      url: result.url,
      width: result.width,
      height: result.height,
      size: result.size,
      format: result.format,
    });
  } catch (err) {
    console.error(err);
    const status = err.status || 500;
    return res.status(status).json({ error: err.message || "Upload failed" });
  }
}

async function uploadOwnerPromoImage(req, res) {
  try {
    const ownerId = req.user?.id;
    if (!ownerId) {
      return res.status(401).json({ error: "Owner authentication required" });
    }
    if (!req.file?.buffer) {
      return res.status(400).json({ error: 'Missing file field "file"' });
    }

    const result = await processAndSaveOwnerPromoImage(ownerId, req.file.buffer);
    return res.status(201).json({
      url: result.url,
      width: result.width,
      height: result.height,
      size: result.size,
      format: result.format,
    });
  } catch (err) {
    console.error(err);
    const status = err.status || 500;
    return res.status(status).json({ error: err.message || "Upload failed" });
  }
}

async function uploadOwnerCatalogImage(req, res) {
  try {
    const ownerId = req.user?.id;
    if (!ownerId) {
      return res.status(401).json({ error: "Owner authentication required" });
    }
    if (!req.file?.buffer) {
      return res.status(400).json({ error: 'Missing file field "file"' });
    }

    const result = await processAndSaveOwnerCatalogImage(ownerId, req.file.buffer);
    return res.status(201).json({
      url: result.url,
      width: result.width,
      height: result.height,
      size: result.size,
      format: result.format,
    });
  } catch (err) {
    console.error(err);
    const status = err.status || 500;
    return res.status(status).json({ error: err.message || "Upload failed" });
  }
}

module.exports = { uploadOwnerImage, uploadOwnerPromoImage, uploadOwnerCatalogImage };
