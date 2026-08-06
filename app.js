const API_URL =
  'https://script.google.com/macros/s/AKfycby79TDbtVLGWt3BnhdlEPvhBi5QWvdZ6Dh8kZuYQRfh4K1bIxlhHQAeUpAJlok6Z2zkFQ/exec';

const operatorInput = document.getElementById('operator');
const startButton = document.getElementById('startButton');
const stopButton = document.getElementById('stopButton');
const cameraMessage = document.getElementById('cameraMessage');

const resultBox = document.getElementById('result');
const resultTitle = document.getElementById('resultTitle');
const attendeeName = document.getElementById('attendeeName');
const ticketDetails = document.getElementById('ticketDetails');

let scanner = null;
let scannerRunning = false;
let scanLocked = false;

let lastCode = '';
let lastScanTime = 0;

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

async function startScanner() {
  const operator = getOperatorName();

  if (!operator || scannerRunning) {
    return;
  }

  startButton.disabled = true;
  cameraMessage.textContent = 'Starting camera…';

  scanner = new Html5Qrcode('reader');

  try {
    const cameras = await Html5Qrcode.getCameras();

    if (!cameras || cameras.length === 0) {
      throw new Error('No camera was found.');
    }

    const rearCamera =
      cameras.find(camera =>
        /back|rear|environment/i.test(camera.label)
      ) || cameras[cameras.length - 1];

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
        // Normal frame-by-frame scan failures are ignored.
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

async function onScanSuccess(decodedText) {
  const ticketId = String(decodedText || '').trim();
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

  cameraMessage.textContent = 'Checking ticket…';

  const operator = getOperatorName();

  if (!operator) {
    scanLocked = false;
    return;
  }

  try {
    const body = new URLSearchParams({
      ticket: ticketId,
      operator: operator
    });

    const response = await fetch(API_URL, {
      method: 'POST',
      body: body,
      redirect: 'follow'
    });

    if (!response.ok) {
      throw new Error(
        'Server returned HTTP ' + response.status
      );
    }

    const data = await response.json();

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

function renderResult(data) {
  resultBox.classList.remove(
    'hidden',
    'success',
    'duplicate',
    'error'
  );

  if (data.status === 'success') {
    resultBox.classList.add('success');

    resultTitle.textContent = 'CHECK-IN SUCCESSFUL';
    attendeeName.textContent =
      data.attendeeName || '';

    ticketDetails.innerHTML =
      escapeHtml(data.ticketId || '') +
      '<br>' +
      escapeHtml(data.checkInTime || '');

    vibrate([150]);
    return;
  }

  if (data.status === 'duplicate') {
    resultBox.classList.add('duplicate');

    resultTitle.textContent = 'ALREADY CHECKED IN';
    attendeeName.textContent =
      data.attendeeName || '';

    ticketDetails.innerHTML =
      escapeHtml(data.ticketId || '') +
      '<br>First check-in: ' +
      escapeHtml(data.checkInTime || '') +
      '<br>Checked in by: ' +
      escapeHtml(data.checkedInBy || '');

    vibrate([150, 100, 150]);
    return;
  }

  resultBox.classList.add('error');

  resultTitle.textContent = 'CHECK-IN FAILED';
  attendeeName.textContent = '';

  ticketDetails.textContent =
    data.message || 'Invalid ticket.';

  vibrate([300, 100, 300]);
}

function showError(message) {
  resultBox.classList.remove(
    'hidden',
    'success',
    'duplicate'
  );

  resultBox.classList.add('error');

  resultTitle.textContent = 'CHECK-IN FAILED';
  attendeeName.textContent = '';
  ticketDetails.textContent = message;
}

function vibrate(pattern) {
  if (navigator.vibrate) {
    navigator.vibrate(pattern);
  }
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
