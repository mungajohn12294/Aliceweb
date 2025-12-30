// server.js - Video Processing Server for Render - FIXED VERSION
const express = require('express');
const multer = require('multer');
const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const app = express();

// Middleware - FIXED: Only ONE CORS middleware
app.use(cors({
  origin: '*', // Allow all origins for testing
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());
app.use(express.static('public'));

// Setup uploads directory
const uploadDir = 'uploads';
const outputDir = 'output';

if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);
if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir);

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage,
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB limit
  }
});

// Welcome route
app.get('/', (req, res) => {
  res.json({
    message: '🎬 Video Editor API Server',
    version: '1.0.0',
    status: 'running',
    endpoints: {
      upload: 'POST /upload',
      process: 'POST /process',
      status: 'GET /status/:id',
      download: 'GET /download/:filename',
      health: 'GET /health'
    },
    serverTime: new Date().toISOString()
  });
});

// Upload video endpoint
app.post('/upload', upload.single('video'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ 
        success: false, 
        error: 'No video file uploaded' 
      });
    }
    
    console.log('File uploaded:', req.file.filename);
    
    res.json({
      success: true,
      videoId: req.file.filename.replace(/\..+$/, ''),
      filename: req.file.filename,
      originalName: req.file.originalname,
      size: req.file.size,
      mimetype: req.file.mimetype,
      url: `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`,
      downloadUrl: `${req.protocol}://${req.get('host')}/download/${req.file.filename}`
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({
      success: false,
      error: 'Upload failed: ' + error.message
    });
  }
});

// Simple process endpoint (for testing)
app.post('/process', async (req, res) => {
  try {
    const { videoUrl, trim, textOverlays, filter, musicVolume } = req.body;
    
    console.log('Processing request:', {
      videoUrl,
      trim,
      textCount: textOverlays?.length || 0,
      filter,
      musicVolume
    });
    
    // Check if video exists
    if (!videoUrl) {
      return res.status(400).json({
        success: false,
        error: 'No video URL provided'
      });
    }
    
    // Extract filename from URL
    const filename = path.basename(videoUrl);
    const videoPath = path.join(uploadDir, filename);
    
    if (!fs.existsSync(videoPath)) {
      return res.status(404).json({
        success: false,
        error: 'Video file not found. Upload it first using /upload endpoint.'
      });
    }
    
    // Generate unique ID
    const processId = Date.now().toString();
    const outputFile = `${processId}_processed.mp4`;
    const outputPath = path.join(outputDir, outputFile);
    
    // For Render.com, FFmpeg might not be available
    // So we'll create a dummy file for testing
    fs.copyFileSync(videoPath, outputPath);
    
    // Simulate processing time
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    res.json({
      success: true,
      processId,
      originalFile: filename,
      processedFile: outputFile,
      downloadUrl: `${req.protocol}://${req.get('host')}/download/${outputFile}`,
      message: 'Video processing simulated successfully (FFmpeg not available)',
      notes: 'For actual processing, install FFmpeg on your server'
    });
    
  } catch (error) {
    console.error('Processing error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Real process endpoint (requires FFmpeg)
app.post('/process-real', upload.single('video'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No video uploaded' });
    }
    
    const { trim, textOverlays, filter, musicVolume } = req.body;
    const videoPath = req.file.path;
    const processId = Date.now().toString();
    const outputFile = `${processId}_processed.mp4`;
    const outputPath = path.join(outputDir, outputFile);
    
    console.log('Starting real processing...');
    
    // FFmpeg processing
    await new Promise((resolve, reject) => {
      let command = ffmpeg(videoPath);
      
      // Apply trim
      if (trim && trim.start !== undefined && trim.end !== undefined) {
        command.setStartTime(trim.start);
        command.setDuration(trim.end - trim.start);
      }
      
      // Apply filter
      if (filter && filter !== 'none') {
        switch(filter) {
          case 'sepia':
            command.videoFilters('colorchannelmixer=.393:.769:.189:0:.349:.686:.168:0:.272:.534:.131');
            break;
          case 'grayscale':
            command.videoFilters('hue=s=0');
            break;
        }
      }
      
      // Add text overlays
      if (textOverlays && textOverlays.length > 0) {
        textOverlays.forEach((text, index) => {
          command.videoFilters(
            `drawtext=text='${text.text}':` +
            `x=${text.x || 50}:` +
            `y=${text.y || 50}:` +
            `fontcolor=white:` +
            `fontsize=${text.size || 24}:` +
            `box=1:` +
            `boxcolor=black@0.5`
          );
        });
      }
      
      command
        .output(outputPath)
        .on('end', () => {
          console.log('Processing completed:', outputFile);
          resolve();
        })
        .on('error', (err) => {
          console.error('FFmpeg error:', err);
          reject(err);
        })
        .run();
    });
    
    // Clean up uploaded file
    fs.unlinkSync(videoPath);
    
    res.json({
      success: true,
      processId,
      downloadUrl: `${req.protocol}://${req.get('host')}/download/${outputFile}`,
      message: 'Video processed successfully'
    });
    
  } catch (error) {
    console.error('Processing error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Download endpoint
app.get('/download/:filename', (req, res) => {
  try {
    const filePath = path.join(outputDir, req.params.filename);
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ 
        success: false, 
        error: 'File not found' 
      });
    }
    
    res.download(filePath, (err) => {
      if (err) {
        console.error('Download error:', err);
        res.status(500).json({ 
          success: false, 
          error: 'Download failed' 
        });
      }
    });
  } catch (error) {
    console.error('Download error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// List uploaded files
app.get('/uploads', (req, res) => {
  try {
    const files = fs.readdirSync(uploadDir).map(filename => ({
      filename,
      url: `${req.protocol}://${req.get('host')}/uploads/${filename}`,
      path: path.join(uploadDir, filename)
    }));
    
    res.json({
      success: true,
      count: files.length,
      files
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// List processed files
app.get('/processed', (req, res) => {
  try {
    const files = fs.readdirSync(outputDir).map(filename => ({
      filename,
      url: `${req.protocol}://${req.get('host')}/download/${filename}`,
      path: path.join(outputDir, filename)
    }));
    
    res.json({
      success: true,
      count: files.length,
      files
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Status check
app.get('/status/:id', (req, res) => {
  const filePath = path.join(outputDir, `${req.params.id}_processed.mp4`);
  const exists = fs.existsSync(filePath);
  
  res.json({
    exists,
    downloadUrl: exists ? 
      `${req.protocol}://${req.get('host')}/download/${req.params.id}_processed.mp4` : 
      null,
    message: exists ? 'Video ready for download' : 'Video not found'
  });
});

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    server: 'Video Editor API',
    version: '1.0.0',
    uploadsDir: fs.existsSync(uploadDir),
    outputDir: fs.existsSync(outputDir),
    memory: process.memoryUsage()
  });
});

// Cleanup old files (optional endpoint)
app.post('/cleanup', (req, res) => {
  try {
    const now = Date.now();
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours
    
    // Clean uploads
    const uploadFiles = fs.readdirSync(uploadDir);
    let uploadsDeleted = 0;
    uploadFiles.forEach(filename => {
      const filePath = path.join(uploadDir, filename);
      const stats = fs.statSync(filePath);
      if (now - stats.mtimeMs > maxAge) {
        fs.unlinkSync(filePath);
        uploadsDeleted++;
      }
    });
    
    // Clean output
    const outputFiles = fs.readdirSync(outputDir);
    let outputDeleted = 0;
    outputFiles.forEach(filename => {
      const filePath = path.join(outputDir, filename);
      const stats = fs.statSync(filePath);
      if (now - stats.mtimeMs > maxAge) {
        fs.unlinkSync(filePath);
        outputDeleted++;
      }
    });
    
    res.json({
      success: true,
      message: 'Cleanup completed',
      uploadsDeleted,
      outputDeleted,
      totalDeleted: uploadsDeleted + outputDeleted
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Static file serving
app.use('/uploads', express.static(uploadDir));
app.use('/output', express.static(outputDir));

// Handle 404
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: `Route ${req.method} ${req.path} not found`
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({
    success: false,
    error: err.message || 'Internal server error'
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🎬 Video Editor Server running on port ${PORT}`);
  console.log(`📁 Uploads directory: ${uploadDir}`);
  console.log(`📁 Output directory: ${outputDir}`);
  console.log(`🌐 Server URL: http://localhost:${PORT}`);
  console.log(`🔄 Waiting for requests...`);
});

module.exports = app;
