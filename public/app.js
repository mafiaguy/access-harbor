const form = document.querySelector('#request-form');
if (form) {
  const catalog = JSON.parse(document.querySelector('#catalog-data').textContent);
  const resource = form.querySelector('#resource'),
    permission = form.querySelector('#permission');
  const steps = [...form.querySelectorAll('[data-step]')];
  let current = 0;
  form.classList.add('enhanced');
  function permissions() {
    permission.replaceChildren();
    const item = catalog.find((r) => r.id === resource.value);
    const rank = { pull: 0, readonly: 0, triage: 1, push: 2, developer: 2, maintain: 3, admin: 4 };
    Object.entries(item?.permissions || {})
      .sort(([a], [b]) => (rank[a] ?? 5) - (rank[b] ?? 5))
      .forEach(([value, label]) => permission.add(new Option(label, value)));
  }
  function resources() {
    resource.replaceChildren();
    const provider = form.querySelector('input[name="provider"]:checked').value;
    catalog
      .filter((r) => r.provider === provider)
      .forEach((r) => resource.add(new Option(r.name, r.id)));
    permissions();
  }
  function show(index) {
    current = index;
    steps.forEach((step, i) => step.classList.toggle('active', i === index));
    document.querySelectorAll('[data-progress]').forEach((item, i) => {
      item.classList.toggle('current', i === index);
      item.classList.toggle('completed', i < index);
      if (i === index) item.setAttribute('aria-current', 'step');
      else item.removeAttribute('aria-current');
    });
    steps[index].querySelector('h2').setAttribute('tabindex', '-1');
    steps[index].querySelector('h2').focus();
  }
  form
    .querySelectorAll('input[name="provider"]')
    .forEach((input) => input.addEventListener('change', resources));
  resource.addEventListener('change', permissions);
  form.querySelectorAll('[data-next]').forEach((button) =>
    button.addEventListener('click', () => {
      for (const input of steps[current].querySelectorAll('input,select,textarea'))
        if (!input.reportValidity()) return;
      const values = {
        resource: resource.selectedOptions[0]?.textContent,
        permission: permission.selectedOptions[0]?.textContent,
        duration: `${form.days.value} ${form.days.value === '1' ? 'day' : 'days'} from provisioning`,
        reason: form.reason.value.trim(),
      };
      for (const [key, value] of Object.entries(values))
        form.querySelector(`[data-summary="${key}"]`).textContent = value;
      show(Math.min(current + 1, 2));
    }),
  );
  form
    .querySelectorAll('[data-back]')
    .forEach((button) => button.addEventListener('click', () => show(Math.max(0, current - 1))));
  form.addEventListener('submit', (event) => {
    if (current !== 2) {
      event.preventDefault();
      return;
    }
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    button.textContent = 'Sending…';
  });
  resources();
}
const confirmation = document.querySelector('#confirm-dialog');
let pendingForm;
document.querySelectorAll('form[data-confirm]').forEach((form) =>
  form.addEventListener('submit', (event) => {
    if (form.dataset.confirmed === 'true') return;
    event.preventDefault();
    pendingForm = form;
    confirmation.querySelector('#confirm-title').textContent = form.dataset.confirm;
    confirmation.querySelector('#confirm-message').textContent =
      'This updates the request and queues any provider removal. You can request access again later.';
    confirmation.returnValue = '';
    confirmation.showModal();
  }),
);
confirmation?.addEventListener('close', () => {
  if (confirmation.returnValue === 'confirm' && pendingForm) {
    pendingForm.dataset.confirmed = 'true';
    pendingForm.requestSubmit();
  }
  pendingForm = undefined;
});
