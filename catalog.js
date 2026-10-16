const searchInput = document.querySelector('#course-search');
const catalogCards = [...document.querySelectorAll('.catalog-card')];
const courseCount = document.querySelector('#course-count');
const emptyMessage = document.querySelector('#catalog-empty');
const activeFilters = document.querySelector('#active-filters');
const filterLabel = document.querySelector('#filter-label');

function applyCourseSearch() {
  if (!searchInput) return;
  const query = searchInput.value.trim().toLowerCase();
  let visible = 0;
  catalogCards.forEach((card) => {
    const matches = `${card.dataset.course} ${card.textContent}`.toLowerCase().includes(query);
    card.hidden = !matches;
    if (matches) visible += 1;
  });
  if (courseCount) courseCount.textContent = `${visible} ${visible === 1 ? 'course' : 'courses'}`;
  if (emptyMessage) emptyMessage.hidden = visible !== 0;
  if (activeFilters) activeFilters.hidden = query.length === 0;
  if (filterLabel) filterLabel.textContent = query ? `Showing courses for “${query}”` : '';
}

function setCourseSearch(value) {
  if (!searchInput) return;
  searchInput.value = value;
  applyCourseSearch();
  document.querySelector('#courses')?.scrollIntoView({ behavior: 'smooth' });
  searchInput.focus({ preventScroll: true });
}

searchInput?.addEventListener('input', applyCourseSearch);

document.querySelector('#hero-course-search')?.addEventListener('submit', (event) => {
  event.preventDefault();
  const value = document.querySelector('#hero-search-input').value.trim();
  setCourseSearch(value);
});

document.querySelector('#hero-search-input')?.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    event.preventDefault();
    setCourseSearch(event.currentTarget.value.trim());
  }
});

document.querySelectorAll('[data-filter]').forEach((button) => {
  button.addEventListener('click', () => setCourseSearch(button.dataset.filter || ''));
});

document.querySelector('#clear-search')?.addEventListener('click', () => {
  setCourseSearch('');
});
