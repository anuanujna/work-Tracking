const ownerNames = ['Unassigned', 'Arun Kumar', 'Meena Shah', 'Deepak Rao', 'Priya Nair'];
const savedOwners = JSON.parse(localStorage.getItem('worktrack-owners') || '{}');
let enhancingOwners = false;

function enhanceOwners() {
  if (enhancingOwners) return;
  enhancingOwners = true;
  document.querySelectorAll('#assignment-table tr').forEach((row) => {
    const code = row.cells[0]?.querySelector('.activity-code')?.textContent;
    const ownerCell = row.cells[1];
    if (!code || !ownerCell || ownerCell.querySelector('.owner-select')) return;
    const currentOwner = savedOwners[code] || ownerCell.textContent.trim() || 'Unassigned';
    ownerCell.innerHTML = `<select class="owner-select" aria-label="Owner for ${code}">${ownerNames.map((name) => `<option ${name === currentOwner ? 'selected' : ''}>${name}</option>`).join('')}</select>`;
    ownerCell.querySelector('select').addEventListener('change', (event) => {
      savedOwners[code] = event.target.value;
      localStorage.setItem('worktrack-owners', JSON.stringify(savedOwners));
      const assignment = assignments.find((item) => item.code === code);
      if (assignment) {
        assignment.owner = event.target.value;
        assignment.initials = event.target.value === 'Unassigned' ? 'UN' : event.target.value.split(' ').map((part) => part[0]).join('').slice(0, 2);
      }
      render();
      showToast(`${event.target.value} is now assigned to this activity.`);
    });
  });
  enhancingOwners = false;
}

new MutationObserver(enhanceOwners).observe(document.getElementById('assignment-table'), { childList: true, subtree: true });
enhanceOwners();
