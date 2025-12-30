// server.js - Video Processing Server for Render
const express = require('express');
const multer = require('multer');
const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Setup uploads directory
const uploadDir = 'uploads';
const outputDir = 'output';

if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);
if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir);

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
});
const upload = multer({ storage });

// Welcome route
app.get('/', (req, res) => {
  res.json({
    message: '🎬 Video Editor API Server',
    endpoints: {
      upload: 'POST /upload',
      process: 'POST /process',
      status: 'GET /status/:id',
      download: 'GET /download/:filename'
    }
  });
});
// Add CORS to your server
const cors = require('cors');
app.use(cors({
  origin: '*', // Allow all origins for testing
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type']
}));
// Upload video endpoint
app.post('/upload', upload.single('video'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No video uploaded' });
  
  res.json({
    success: true,
    videoId: req.file.filename.replace(/\..+$/, ''),
    filename: req.file.filename,
    url: `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`
  });
});

// Process video endpoint
app.post('/process', async (req, res) => {
  try {
    const { videoUrl, trim, textOverlays, filter, musicVolume } = req.body;
    
    // Generate unique ID
    const processId = Date.now().toString();
    const outputFile = `${processId}_processed.mp4`;
    const outputPath = path.join(outputDir, outputFile);
    
    console.log(`Processing video: ${videoUrl}`);
    
    // In production, you'd download the video from videoUrl
    // For now, let's simulate processing
    const videoPath = path.join(uploadDir, path.basename(videoUrl));
    
    if (!fs.existsSync(videoPath)) {
      return res.status(404).json({ error: 'Video file not found' });
    }
    
    // Process with FFmpeg
    await new Promise((resolve, reject) => {
      let command = ffmpeg(videoPath);
      
      // Apply trim if specified
      if (trim && trim.start !== undefined && trim.end !== undefined) {
        command.setStartTime(trim.start);
        command.setDuration(trim.end - trim.start);
      }
      
      // Apply filter if specified
      if (filter && filter !== 'none') {
        switch(filter) {
          case 'sepia':
            command.videoFilters('colorchannelmixer=.393:.769:.189:0:.349:.686:.168:0:.272:.534:.131');
            break;
          case 'grayscale':
            command.videoFilters('hue=s=0');
            break;
          case 'vintage':
            command.videoFilters('curves=r=\'0/0.11 .42/.51 1/0.95\':g=\'0/0 .5/0.48 1/1\':b=\'0/0.22 .49/.44 1/0.8\'');
            break;
        }
      }
      
      // Add text overlays
      if (textOverlays && textOverlays.length > 0) {
        textOverlays.forEach((text, index) => {
          command.videoFilters(`drawtext=text='${text.text}':x=${text.x || 50}:y=${text.y || 50}:fontcolor=white:fontsize=24:box=1:boxcolor=black@0.5`);
        });
      }
      
      // Set output
      command
        .output(outputPath)
        .on('end', () => {
          console.log(`Processing completed: ${outputFile}`);
          resolve();
        })
        .on('error', (err) => {
          console.error('FFmpeg error:', err);
          reject(err);
        })
        .run();
    });
    
    // Return success response
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
  const filePath = path.join(outputDir, req.params.filename);
  
  if (fs.existsSync(filePath)) {
    res.download(filePath);
  } else {
    res.status(404).json({ error: 'File not found' });
  }
});

// Uploads directory access
app.use('/uploads', express.static(uploadDir));
app.use('/output', express.static(outputDir));

// Status check
app.get('/status/:id', (req, res) => {
  const filePath = path.join(outputDir, `${req.params.id}_processed.mp4`);
  const exists = fs.existsSync(filePath);
  
  res.json({
    exists,
    downloadUrl: exists ? `${req.protocol}://${req.get('host')}/download/${req.params.id}_processed.mp4` : null
  });
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🎬 Video Editor Server running on port ${PORT}`);
  console.log(`🔄 Waiting for video processing requests...`);
});
