const axios = require('axios');

async function getHytaleNews() {
  try {
    const response = await axios.get('https://launcher.hytale.com/launcher-feed/release/feed.json', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      timeout: 10000
    });
    
    const articles = response.data.articles || [];
    return articles.map(article => ({
      title: article.title || '',
      description: article.description || '',
      destUrl: article.dest_url || '',
      imageUrl: article.image_url ? 
        (article.image_url.startsWith('http') ? 
          article.image_url : 
          `https://launcher.hytale.com/launcher-feed/release/${article.image_url}`
        ) : ''
    }));
  } catch (error) {
    console.error('Failed to fetch news:', error.message);
    return [];
  }
}

module.exports = {
  getHytaleNews
};
