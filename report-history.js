let viewedReports = [];
const overviewSections = [...document.querySelectorAll('.main-content > section')];
const reportsView = document.getElementById('reports-view');
const reportStyles = document.createElement('style');
reportStyles.textContent = '.report-list{display:grid;gap:10px}.report-row{display:flex;align-items:center;gap:13px;padding:14px;border:1px solid #e7ece8;border-radius:8px}.report-file-icon{width:34px;height:34px;border-radius:7px;background:#e5f3e7;color:#2f8f5b;display:grid;place-items:center;font-size:18px}.report-details{display:grid;gap:4px;flex:1}.report-details strong{font-size:13px}.report-details span,.empty-reports{font-size:11px;color:#75817d}.empty-reports{padding:25px 0}';
document.head.appendChild(reportStyles);

async function saveViewedReport(name, rows) {
  const response = await fetch('/api/reports', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, rows }) });
  if (!response.ok) throw new Error('Report could not be stored.');
  const report = await response.json();
  viewedReports = [report, ...viewedReports.filter((item) => item.name !== name)].slice(0, 10);
  renderReportLibrary();
}

async function loadReports() {
  const response = await fetch('/api/reports');
  if (!response.ok) throw new Error('Reports could not be loaded.');
  viewedReports = await response.json();
  renderReportLibrary();
}

function renderReportLibrary() {
  document.getElementById('report-count').textContent = viewedReports.length;
  if (viewedReports[0] && document.getElementById('active-report-name')) setActiveReportName(viewedReports[0].name);
  const reportList = document.getElementById('report-list');
  reportList.innerHTML = viewedReports.length ? viewedReports.map((report, index) => {
    const date = new Date(report.viewedAt).toLocaleString();
    return `<div class="report-row"><div class="report-file-icon">▤</div><div class="report-details"><strong>${report.name}</strong><span>${report.rowCount} activities · Viewed ${date}</span></div><button class="text-button reopen-report" data-report-index="${index}">Open report →</button></div>`;
  }).join('') : '<div class="empty-reports">Reports you upload or view will be saved here.</div>';
  reportList.querySelectorAll('.reopen-report').forEach((button) => button.addEventListener('click', () => {
    const report = viewedReports[Number(button.dataset.reportIndex)];
    if (!report) return;
    assignments = report.rows;
    document.getElementById('last-import').textContent = report.name;
    setActiveReportName(report.name);
    render();
    showOverview();
    showToast(`${report.name} opened.`);
  }));
}

function showReports() {
  overviewSections.forEach((section) => { if (section !== reportsView) section.hidden = true; });
  reportsView.hidden = false;
  renderReportLibrary();
  document.querySelector('.breadcrumb').textContent = 'Operations / Reports';
  document.querySelector('h1').textContent = 'Viewed reports';
  document.querySelectorAll('.nav-item').forEach((item) => item.classList.toggle('active', item.textContent.includes('Reports')));
}

function showOverview() {
  overviewSections.forEach((section) => { if (section !== reportsView) section.hidden = false; });
  reportsView.hidden = true;
  document.querySelector('.breadcrumb').textContent = 'Operations / Overview';
  document.querySelector('h1').textContent = 'Assignment control room';
  document.querySelectorAll('.nav-item').forEach((item) => item.classList.toggle('active', item.textContent.includes('Overview')));
}

function showSection(section) {
  const target = document.querySelector(section);
  if (!target) return;
  overviewSections.forEach((item) => { item.hidden = item !== target; });
  reportsView.hidden = true;
  const page = target.classList.contains('assignments-panel') ? ['Operations / Assignments', 'Assignments'] : ['Operations / People', 'People'];
  document.querySelector('.breadcrumb').textContent = page[0];
  document.querySelector('h1').textContent = page[1];
  document.querySelectorAll('.nav-item').forEach((item) => item.classList.toggle('active', item.textContent.includes(page[1])));
}

document.querySelectorAll('.nav-item').forEach((item) => item.addEventListener('click', () => {
  if (item.textContent.includes('Reports')) showReports();
  else if (item.textContent.includes('People')) showSection('.workload-panel');
  else if (item.textContent.includes('Assignments')) showSection('.assignments-panel');
  else showOverview();
}));
document.getElementById('overview-view').addEventListener('click', showOverview);
window.recordViewedReport = saveViewedReport;
renderReportLibrary();
if (!window.location.hostname.endsWith('github.io')) loadReports().catch((error) => console.error(error));
