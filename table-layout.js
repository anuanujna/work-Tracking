const projectByCode = {};

function updateTableLayout() {
  const headerCells = document.querySelectorAll('.table-wrap thead th');
  if (headerCells.length >= 6) {
    headerCells[1].textContent = 'Project';
    headerCells[2].textContent = 'Item code';
    headerCells[3].textContent = 'Milestone';
    headerCells[4].textContent = 'Progress';
    headerCells[5].textContent = 'Status';
  }

  document.querySelectorAll('#assignment-table tr').forEach((row) => {
    const codeCell = row.cells[0];
    const projectCell = row.cells[1];
    const milestoneCell = row.cells[2];
    const oldDueCell = row.cells[3];
    if (!codeCell || !projectCell || !milestoneCell || !oldDueCell || row.dataset.layoutUpdated) return;

    const activityCode = codeCell.querySelector('.activity-code')?.textContent || '';
    const project = projectByCode[activityCode] || '3.42 MWp-Tigadi-Deepak';
    projectCell.innerHTML = `<span class="project-value">${project}</span>`;
    oldDueCell.innerHTML = milestoneCell.innerHTML;
    milestoneCell.innerHTML = `<span class="item-code-value">${activityCode}</span>`;
    row.dataset.layoutUpdated = 'true';
  });
}

new MutationObserver(updateTableLayout).observe(document.getElementById('assignment-table'), { childList: true, subtree: true });
updateTableLayout();
