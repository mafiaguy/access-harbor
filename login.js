const previewForm = document.querySelector('#preview-login');

previewForm?.addEventListener('submit', (event) => {
  event.preventDefault();
  const emailInput = document.querySelector('#learner-email');
  if (!emailInput?.reportValidity()) return;
  sessionStorage.setItem('opentechDemoEmail', emailInput.value.trim());
  window.location.href = '/lms/security-engineering/';
});
