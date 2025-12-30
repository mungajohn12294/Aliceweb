// server.js
const express = require('express');
const multer = require('multer');
const ffmpeg = require('fluent-ffmpeg');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const app = express();

app.use(express.json());

// Simple video processing endpoint
app.post('/process', async (req, res) => {
  try {
    const { videoUrl, trim, textOverlays, filter, musicVolume } = req.body;
    
    // Generate a unique filename
    const outputFile = `processed_${Date.now()}.mp4`;
    const outputPath = path.join(__dirname, 'output', outputFile);
    
    // Create output directory
    if (!fs.existsSync('output')) {
      fs.mkdirSync('output');
    }
    
    // Download video from URL
    const videoPath = await downloadVideo(videoUrl);
    
    // Process with FFmpeg
    await processVideo(videoPath, outputPath, {
      trim,
      textOverlays,
      filter,
      musicVolume
    });
    
    // Return the processed video URL
    res.json({
      success: true,
      videoUrl: `${req.protocol}://${req.get('host')}/download/${outputFile}`,
      message: 'Video processed successfully'
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Download endpoint
app.get('/download/:filename', (req, res) => {
  const file = path.join(__dirname, 'output', req.params.filename);
  res.download(file);
});

// Helper functions
async function downloadVideo(url) {
  const localPath = `temp_${Date.now()}.mp4`;
  const writer = fs.createWriteStream(localPath);
  
  const response = await axios({
    url,
    method: 'GET',
    responseType: 'stream'
  });
  
  response.data.pipe(writer);
  
  return new Promise((resolve, reject) => {
    writer.on('finish', () => resolve(localPath));
    writer.on('error', reject);
  });
}

function processVideo(inputPath, outputPath, options) {
  return new Promise((resolve, reject) => {
    let command = ffmpeg(inputPath);
    
    // Apply trim
    if (options.trim) {
      command.setStartTime(options.trim.start);
      command.setDuration(options.trim.end - options.trim.start);
    }
    
    // Apply filter
    if (options.filter && options.filter !== 'none') {
      if (options.filter === 'sepia') {
        command.videoFilters('colorchannelmixer=.393:.769:.189:0:.349:.686:.168:0:.272:.534:.131');
      } else if (options.filter === 'grayscale') {
        command.videoFilters('hue=s=0');
      }
    }
    
    // Add text overlays
    options.textOverlays?.forEach((text, index) => {
      command.videoFilters(`drawtext=text='${text.text}':x=${text.x}:y=${text.y}:fontcolor=white:fontsize=24`);
    });
    
    // Add music volume
    if (options.musicVolume > 0) {
      // In real app, you'd add background music here
    }
    
    command
      .output(outputPath)
      .on('end', () => {
        // Cleanup temp file
        fs.unlinkSync(inputPath);
        resolve();
      })
      .on('error', reject)
      .run();
  });
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
