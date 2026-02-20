
let newsData = [];

export async function loadNews() {
  try {
    if (window.electronAPI && window.electronAPI.getHytaleNews) {
      try {
        const realNews = await window.electronAPI.getHytaleNews();
        if (realNews && realNews.length > 0) {
          newsData = realNews.slice(0, 10).map((article, index) => ({
            id: index + 1,
            title: article.title,
            summary: article.description,
            type: "NEWS",
            image: article.imageUrl || '',
            date: formatDate(article.date),
            url: article.destUrl
          }));
          displayHomeNews(newsData.slice(0, 5));
          displayFullNews(newsData);
        } else {
          showErrorNews();
        }
      } catch (error) {
        console.log('Failed to load news:', error.message);
        showErrorNews();
      }
    } else {
      showErrorNews();
    }
  } catch (error) {
    console.error('Error loading news:', error);
    showErrorNews();
  }
}

function displayHomeNews(news) {
  const newsGrid = document.getElementById('newsGrid');
  if (!newsGrid) return;
  
  newsGrid.innerHTML = news.map(article => `
    <div class="news-item news-card" onclick="openNewsDetails(${article.id})">
      <div class="news-image" style="background-image: url('${article.image}');"></div>
      <div class="news-overlay">
        <span class="news-type">${article.type}</span>
        <span class="news-date">${article.date}</span>
      </div>
      <div class="news-content">
        <h3 class="news-title">${article.title}</h3>
        <p class="news-summary">${article.summary}</p>
      </div>
    </div>
  `).join('');
}

function displayFullNews(news) {
  const allNewsGrid = document.getElementById('allNewsGrid');
  if (!allNewsGrid) return;
  
  allNewsGrid.innerHTML = news.map(article => `
    <div class="news-item news-card" onclick="openNewsDetails(${article.id})">
      <div class="news-image" style="background-image: url('${article.image}');"></div>
      <div class="news-overlay">
        <span class="news-type">${article.type}</span>
        <span class="news-date">${article.date}</span>
      </div>
      <div class="news-content">
        <h3 class="news-title">${article.title}</h3>
        <p class="news-summary">${article.summary}</p>
      </div>
    </div>
  `).join('');
}

function showErrorNews() {
  const newsGrid = document.getElementById('newsGrid');
  if (newsGrid) {
    newsGrid.innerHTML = `
      <div class="loading-news">
        <i class="fas fa-exclamation-triangle text-4xl mb-4 text-yellow-500"></i>
        <span>Unable to load news</span>
      </div>
    `;
  }
}

function openNewsDetails(newsId) {
  const article = newsData.find(item => item.id === newsId);
  if (article && article.url) {
    openNewsArticle(article.url);
  } else {
    console.log('Opening news article:', article);
  }
}

function openNewsArticle(url) {
  if (url && url !== '#' && window.electronAPI && window.electronAPI.openExternal) {
    window.electronAPI.openExternal(url);
  }
}

function formatDate(dateString) {
  if (!dateString) return 'RECENTLY';
  
  const date = new Date(dateString);
  const now = new Date();
  const diffTime = Math.abs(now - date);
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  
  if (diffDays === 1) return '1 DAY AGO';
  if (diffDays < 7) return `${diffDays} DAYS AGO`;
  if (diffDays < 30) return `${Math.ceil(diffDays / 7)} WEEKS AGO`;
  return date.toLocaleDateString();
}

window.openNewsDetails = openNewsDetails;
window.navigateToPage = (page) => {
  if (window.LauncherUI) {
    window.LauncherUI.showPage(`${page}-page`);
    window.LauncherUI.setActiveNav(page);
  }
};

document.addEventListener('DOMContentLoaded', loadNews);
