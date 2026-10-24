async function readResponse(response) {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { message: text || "رد غير مفهوم من الخادم." };
  }
}

const form = document.querySelector('#publish-form');
const result = document.querySelector('#publish-result');
const squaresNode = document.querySelector('#squares');
const loadMoreButton = document.querySelector('#load-more');
let offset = 0;
const pageSize = 100;
let loading = false;

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = form.querySelector('button');
  button.disabled = true;
  result.textContent = 'جارٍ التحقق والنشر…';
  const data = Object.fromEntries(new FormData(form).entries());
  try {
    const response = await fetch('/api/publish', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data)
    });
    const body = await readResponse(response);
    if (!response.ok) throw new Error(body.message || 'تعذر النشر. راجع البيانات وحاول مرة أخرى.');
    result.textContent = `تم نشر القصة في المربع رقم ${body.squareId}.`;
    form.reset(); offset = 0; await loadSquares(true);
  } catch (error) {
    result.textContent = error.message || 'تعذر الاتصال بالخادم.';
  } finally { button.disabled = false; }
});

async function loadSquares(reset = false) {
  if (loading) return;
  loading = true;
  if (reset) { offset = 0; squaresNode.replaceChildren(); }
  if (!offset) squaresNode.textContent = 'جارٍ تحميل القصص…';
  loadMoreButton.disabled = true;
  try {
    const response = await fetch(`/api/squares?limit=${pageSize}&offset=${offset}`);
    if (!response.ok) throw new Error();
    const { squares } = await readResponse(response);
    if (!offset) squaresNode.replaceChildren();
    for (const square of squares) {
      const card = document.createElement('article'); card.className = 'square';
      const title = document.createElement('strong'); title.textContent = `المربع ${square.square_id} — ${square.name}`;
      const story = document.createElement('p');
      story.textContent = square.is_published ? square.story : 'المربع متاح — يتطلب النشر كود تفعيل صالحًا.';
      if (!square.is_published) card.classList.add('available');
      card.append(title, story); squaresNode.append(card);
    }
    offset += squares.length;
    loadMoreButton.hidden = squares.length < pageSize;
    if (!offset) {
      const empty = document.createElement('p'); empty.className = 'empty';
      empty.textContent = 'لسه مفيش قصص منشورة. كن أول من يشارك قصته.'; squaresNode.append(empty);
    }
  } catch {
    if (!offset) squaresNode.textContent = 'تعذر تحميل القصص. حاول مرة أخرى.';
  } finally { loading = false; loadMoreButton.disabled = false; }
}
document.querySelector('#load-squares').addEventListener('click', () => loadSquares(true));
loadMoreButton.addEventListener('click', () => loadSquares(false));
loadSquares(true);
