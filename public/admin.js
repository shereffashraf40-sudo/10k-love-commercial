async function readResponse(response) {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { message: text || "رد غير مفهوم من الخادم." };
  }
}

const form = document.querySelector('#issue-form');
const result = document.querySelector('#issue-result');
form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = form.querySelector('button'); button.disabled = true; result.textContent = 'جارٍ إصدار الكود…';
  try {
    const response = await fetch('/admin/codes', {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-csrf-token': document.querySelector('#csrf').value },
      body: JSON.stringify({ squareId: document.querySelector('#squareId').value })
    });
    const body = await readResponse(response);
    if (!response.ok) throw new Error(body.message || body.error || 'تعذر إصدار الكود.');
    result.textContent = `كود المربع ${body.squareId}: ${body.code}\nاحتفظ به الآن؛ لن يظهر كاملًا مرة أخرى.`;
  } catch (error) { result.textContent = error.message || 'حدث خطأ.'; }
  finally { button.disabled = false; }
});
