const API_URL =
  'https://script.google.com/macros/s/AKfycby95G81Y6M5ozXYY493Z_XRtnf0YUy69zGSeUiF0uOQT5oh--bxFnYhrVoEiA53LHHl/exec';

const operatorInput = document.getElementById('operator');
const startButton = document.getElementById('startButton');
const stopButton = document.getElementById('stopButton');
const cameraMessage = document.getElementById('cameraMessage');

const resultBox = document.getElementById('result');
const resultTitle = document.getElementById('resultTitle');
const attendeeName = document.getElementById('attendeeName');
const ticketDetails = document.getElementById('ticketDetails');

const searchButton = document.getElementById('searchButton');
const searchBox = document.getElementById('searchBox');
const searchResults = document.getElementById('searchResults');

let scanner = null;
let scannerRunning = false;
let scanLocked = false;

let lastCode = '';
let lastScanTime = 0;


// ===========================
// VOLUNTEER NAME
// ===========================

operatorInput.value =
  localStorage.getItem('gardenPartyOperator') || '';

operatorInput.addEventListener('change', () => {
  localStorage.setItem(
    'gardenPartyOperator',
    operatorInput.value.trim()
  );
});

startButton.addEventListener('click', startScanner);
stopButton.addEventListener('click', stopScanner);


function getOperatorName() {
  const name = operatorInput.value.trim();

  if (!name) {
    alert('Please enter the volunteer name first.');
    operatorInput.focus();
    return '';
  }

  localStorage.setItem('gardenPartyOperator', name);

  return name;
}


// ===========================
// START SCANNER
// ===========================

async function startScanner() {
  const operator = getOperatorName();

  if (!operator || scannerRunning) {
    return;
  }

  startButton.disabled = true;

  cameraMessage.textContent =
    'Starting camera…';

  scanner = new Html5Qrcode('reader');

  try {
    const cameras =
      await Html5Qrcode.getCameras();

    if (!cameras || cameras.length === 0) {
      throw new Error(
        'No camera was found.'
      );
    }

    const rearCamera =
      cameras.find(camera =>
        /back|rear|environment/i.test(
          camera.label
        )
      ) ||
      cameras[cameras.length - 1];

    await scanner.start(
      rearCamera.id,
      {
        fps: 10,
        qrbox: {
          width: 250,
          height: 250
        },
        aspectRatio: 1
      },
      onScanSuccess,
      () => {
        // Normal scan failures ignored.
      }
    );

    scannerRunning = true;

    startButton.classList.add('hidden');
    stopButton.classList.remove('hidden');

    cameraMessage.textContent =
      'Scanner is active. Hold the QR code inside the frame.';

  } catch (error) {
    scannerRunning = false;
    scanner = null;

    startButton.disabled = false;

    showError(
      error.message ||
      'Camera could not be started. Please allow camera access.'
    );

    cameraMessage.textContent =
      'Camera could not be started.';
  }
}


// ===========================
// STOP SCANNER
// ===========================

async function stopScanner() {
  if (!scanner || !scannerRunning) {
    return;
  }

  stopButton.disabled = true;

  try {
    await scanner.stop();
    await scanner.clear();
  } catch (error) {
    console.log(error);
  }

  scannerRunning = false;
  scanner = null;

  stopButton.disabled = false;
  stopButton.classList.add('hidden');

  startButton.disabled = false;
  startButton.classList.remove('hidden');

  cameraMessage.textContent =
    'Scanner stopped. Tap Start live scanner to begin again.';
}


// ===========================
// QR SCAN SUCCESS
// ===========================

async function onScanSuccess(decodedText) {
  const ticketId =
    String(decodedText || '').trim();

  const now = Date.now();

  if (!ticketId || scanLocked) {
    return;
  }

  if (
    ticketId === lastCode &&
    now - lastScanTime < 5000
  ) {
    return;
  }

  lastCode = ticketId;
  lastScanTime = now;
  scanLocked = true;

  cameraMessage.textContent =
    'Checking ticket…';

  const operator = getOperatorName();

  if (!operator) {
    scanLocked = false;
    return;
  }

  try {
    const params =
      new URLSearchParams({
        ticket: ticketId,
        operator: operator
      });

    const requestUrl =
      API_URL +
      '?' +
      params.toString();

    const response =
      await fetch(
        requestUrl,
        {
          method: 'GET',
          redirect: 'follow',
          cache: 'no-store'
        }
      );

    if (!response.ok) {
      throw new Error(
        'Server returned HTTP ' +
        response.status
      );
    }

    const data =
      await response.json();

    renderResult(data);

  } catch (error) {
    showError(
      error.message ||
      'The ticket could not be checked.'
    );

  } finally {
    cameraMessage.textContent =
      'Scanner is active. Hold the next QR code inside the frame.';

    setTimeout(() => {
      scanLocked = false;
    }, 1800);
  }
}


// ===========================
// DISPLAY SCAN RESULT
// ===========================

function renderResult(data) {
  resultBox.classList.remove(
    'hidden',
    'success',
    'duplicate',
    'error'
  );

  if (data.status === 'success') {
    resultBox.classList.add('success');

    resultTitle.textContent =
      'CHECK-IN SUCCESSFUL';

    attendeeName.textContent =
      data.attendeeName || '';

    ticketDetails.innerHTML =
      escapeHtml(
        data.ticketId || ''
      ) +
      '<br>' +
      escapeHtml(
        data.checkInTime || ''
      );

    vibrate([150]);

    return;
  }

  if (data.status === 'duplicate') {
    resultBox.classList.add(
      'duplicate'
    );

    resultTitle.textContent =
      'ALREADY CHECKED IN';

    attendeeName.textContent =
      data.attendeeName || '';

    ticketDetails.innerHTML =
      escapeHtml(
        data.ticketId || ''
      ) +
      '<br>First check-in: ' +
      escapeHtml(
        data.checkInTime || ''
      ) +
      '<br>Checked in by: ' +
      escapeHtml(
        data.checkedInBy || ''
      );

    vibrate(
      [150, 100, 150]
    );

    return;
  }

  resultBox.classList.add('error');

  resultTitle.textContent =
    'CHECK-IN FAILED';

  attendeeName.textContent = '';

  ticketDetails.textContent =
    data.message ||
    'Invalid ticket.';

  vibrate(
    [300, 100, 300]
  );
}


function showError(message) {
  resultBox.classList.remove(
    'hidden',
    'success',
    'duplicate'
  );

  resultBox.classList.add(
    'error'
  );

  resultTitle.textContent =
    'CHECK-IN FAILED';

  attendeeName.textContent = '';

  ticketDetails.textContent =
    message;
}


function vibrate(pattern) {
  if (navigator.vibrate) {
    navigator.vibrate(pattern);
  }
}


// ===========================
// SEARCH ATTENDEE
// ===========================

if (searchButton) {
  searchButton.addEventListener(
    'click',
    searchAttendee
  );
}

if (searchBox) {
  searchBox.addEventListener(
    'keypress',
    function (e) {
      if (e.key === 'Enter') {
        searchAttendee();
      }
    }
  );
}


async function searchAttendee() {
  const query =
    searchBox.value.trim();

  if (!query) {
    return;
  }

  searchResults.innerHTML =
    'Searching...';

  try {
    const response =
      await fetch(
        API_URL +
        '?action=search&query=' +
        encodeURIComponent(query),
        {
          cache: 'no-store'
        }
      );

    if (!response.ok) {
      throw new Error(
        'Search server returned HTTP ' +
        response.status
      );
    }

    const data =
      await response.json();

    if (
      !data.results ||
      data.results.length === 0
    ) {
      searchResults.innerHTML =
        '<p>No attendee found.</p>';

      return;
    }

    let html = '';

    data.results.forEach(person => {
      html +=
        '<div class="search-card">' +

        '<strong>' +
        escapeHtml(
          person.attendeeName || ''
        ) +
        '</strong><br>' +

        'Ticket: ' +
        escapeHtml(
          person.ticketId || ''
        ) +
        '<br>' +

        'Main Registrant: ' +
        escapeHtml(
          person.mainRegistrant || ''
        ) +
        '<br>' +

        'Status: ' +
        (
          person.checkedIn
            ? '✅ Checked In'
            : '❌ Not Checked In'
        ) +

        '</div><br>';
    });

    searchResults.innerHTML =
      html;

  } catch (error) {
    console.error(error);

    searchResults.innerHTML =
      '<p>Unable to search attendee.</p>';
  }
}


// ===========================
// HTML SAFETY
// ===========================

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}



// ===========================
// DASHBOARD
// ===========================

const registeredCount =
  document.getElementById('total');

const checkedInCount =
  document.getElementById('checked');

const remainingCount =
  document.getElementById('remaining');

async function refreshDashboard() {
  try {
    const response = await fetch(
      API_URL + '?action=dashboard',
      {
        cache: 'no-store'
      }
    );

    if (!response.ok) {
      throw new Error(
        'Dashboard server returned HTTP ' +
        response.status
      );
    }

    const data = await response.json();

    if (registeredCount) {
      registeredCount.textContent =
        data.total ?? '–';
    }

    if (checkedInCount) {
      checkedInCount.textContent =
        data.checkedIn ?? '–';
    }

    if (remainingCount) {
      remainingCount.textContent =
        data.remaining ?? '–';
    }

  } catch (error) {
    console.error('Dashboard error:', error);
  }
}

refreshDashboard();

setInterval(
  refreshDashboard,
  10000
);
