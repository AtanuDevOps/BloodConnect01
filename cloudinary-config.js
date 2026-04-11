/**
 * Cloudinary Configuration and Image Upload Logic
 */

const cloudinaryConfig = {
  cloudName: "dgxyhfwjy", // Replace with your Cloudinary cloud name
  uploadPreset: "bloodconnect_upload", // Replace with your unsigned upload preset
  get uploadUrl() {
    return `https://api.cloudinary.com/v1_1/${this.cloudName}/image/upload`;
  }
};

/**
 * Reusable function to upload an image to Cloudinary
 * @param {File} file - The image file to upload
 * @returns {Promise<string|null>} - Returns the secure_url if successful, otherwise null
 */
async function uploadImage(file) {
  // 1. Validation: Check if file exists
  if (!file) {
    console.error("Cloudinary upload failed: No file provided");
    return null;
  }

  try {
    // 2. Prepare FormData
    const formData = new FormData();
    formData.append("file", file);
    formData.append("upload_preset", cloudinaryConfig.uploadPreset);

    // 3. Send POST request
    const response = await fetch(cloudinaryConfig.uploadUrl, {
      method: "POST",
      body: formData
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error?.message || "Upload failed");
    }

    // 4. Parse response
    const data = await response.json();
    
    // Return secure_url from response
    return data.secure_url;

  } catch (error) {
    // 5. Error Handling
    console.error("Cloudinary upload failed:", error.message);
    return null;
  }
}

// Make globally available if needed
window.uploadImage = uploadImage;
window.cloudinaryConfig = cloudinaryConfig;
