import { useEffect, useState } from 'react';

const apiBase = 'http://localhost:4000/api';

function App() {
  const [books, setBooks] = useState([]);
  const [selectedBook, setSelectedBook] = useState(null);
  const [phone, setPhone] = useState('');
  const [page, setPage] = useState(1);
  const [pagesToBuy, setPagesToBuy] = useState('1');
  const [pageContent, setPageContent] = useState('');
  const [message, setMessage] = useState('');
  const [selectedBookDetails, setSelectedBookDetails] = useState(null);
  const [uploadState, setUploadState] = useState({ title: '', author: '', pricePerPage: '10', destinationType: 'default', destinationValue: '', file: null });

  useEffect(() => {
    refreshBooks();
  }, []);

  const refreshBooks = async () => {
    const res = await fetch(`${apiBase}/books`);
    const data = await res.json();
    setBooks(data);
  };

  const selectBook = async (book) => {
    setSelectedBook(book);
    setPage(1);
    setPageContent('');
    setMessage('');
    const res = await fetch(`${apiBase}/books/${book.id}`);
    const data = await res.json();
    setSelectedBookDetails(data);
  };

  const uploadBook = async (event) => {
    event.preventDefault();
    if (!uploadState.title || !uploadState.author || !uploadState.pricePerPage || !uploadState.file) {
      setMessage('Fill all upload fields and select a file.');
      return;
    }

    const formData = new FormData();
    formData.append('title', uploadState.title);
    formData.append('author', uploadState.author);
    formData.append('pricePerPage', uploadState.pricePerPage);
    formData.append('destinationType', uploadState.destinationType);
    formData.append('destinationValue', uploadState.destinationValue);
    formData.append('file', uploadState.file);

    const res = await fetch(`${apiBase}/books`, {
      method: 'POST',
      body: formData
    });
    const data = await res.json();
    if (!res.ok) {
      setMessage(data.message || 'Upload failed.');
      return;
    }

    setMessage(`Uploaded ${data.title}.`);
    setUploadState({ title: '', author: '', pricePerPage: '10', destinationType: 'default', destinationValue: '', file: null });
    await refreshBooks();
  };

  const purchasePages = async () => {
    if (!selectedBook) return;
    const pageCount = Number(pagesToBuy);
    if (!Number.isInteger(pageCount) || pageCount < 1) {
      setMessage('Enter a valid page quantity.');
      return;
    }

    if (!phone) {
      setMessage('Enter your M-Pesa phone number.');
      return;
    }

    const pages = Array.from({ length: pageCount }, (_, index) => page + index);
    const res = await fetch(`${apiBase}/payments/mpesa`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bookId: selectedBook.id, pages, phoneNumber: phone })
    });
    const data = await res.json();
    if (!res.ok) {
      setMessage(`${data.message || 'Payment request failed.'} ${data.details ? JSON.stringify(data.details) : ''}`);
      return;
    }
    setMessage(data.message || 'Payment request sent.');
  };

  const loadPage = async () => {
    if (!selectedBook) return;
    const res = await fetch(`${apiBase}/reader/${selectedBook.id}/page/${page}`);
    const data = await res.json();
    if (!res.ok) {
      setMessage(data.message);
      setPageContent('');
      return;
    }
    setPageContent(data.content);
    setMessage('');
  };

  return (
    <div style={{ padding: 24, fontFamily: 'Arial, sans-serif', maxWidth: 1000, margin: '0 auto' }}>
      <h1>BOOK XRAY</h1>

      <section style={{ marginBottom: 24, background: '#fff', padding: 20, borderRadius: 12, boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
        <h2>Upload a Book</h2>
        <form onSubmit={uploadBook} style={{ display: 'grid', gap: 12 }}>
          <label>
            Title
            <input value={uploadState.title} onChange={(e) => setUploadState({ ...uploadState, title: e.target.value })} placeholder="My Book Title" />
          </label>
          <label>
            Author
            <input value={uploadState.author} onChange={(e) => setUploadState({ ...uploadState, author: e.target.value })} placeholder="Author Name" />
          </label>
          <label>
            Price per page (KES)
            <input type="number" min="1" value={uploadState.pricePerPage} onChange={(e) => setUploadState({ ...uploadState, pricePerPage: e.target.value })} />
          </label>
          <label>
            Payment destination type
            <select value={uploadState.destinationType} onChange={(e) => setUploadState({ ...uploadState, destinationType: e.target.value })}>
              <option value="default">Default paybill</option>
              <option value="mpesa_phone">M-Pesa phone number</option>
              <option value="bank_account">Bank account</option>
            </select>
          </label>
          {uploadState.destinationType !== 'default' && (
            <label>
              Destination value
              <input value={uploadState.destinationValue} onChange={(e) => setUploadState({ ...uploadState, destinationValue: e.target.value })} placeholder={uploadState.destinationType === 'mpesa_phone' ? '2547xxxxxxxx' : 'Bank account number'} />
            </label>
          )}
          <label>
            Book file (TXT, PDF, DOCX)
            <input
              type="file"
              accept=".txt,.pdf,.docx,text/plain,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              onChange={(e) => setUploadState({ ...uploadState, file: e.target.files?.[0] || null })}
            />
          </label>
          <button type="submit">Upload Book</button>
        </form>
      </section>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 24 }}>
        <section style={{ background: '#fff', padding: 20, borderRadius: 12, boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
          <h2>Available Books</h2>
          {books.length === 0 ? (
            <p>No books uploaded yet.</p>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {books.map((book) => (
                <li key={book.id} style={{ marginBottom: 12 }}>
                  <button onClick={() => selectBook(book)} style={{ width: '100%', padding: 12, textAlign: 'left', borderRadius: 8, border: '1px solid #e5e7eb' }}>
                    <strong>{book.title}</strong>
                    <div>{book.author}</div>
                    <div>Pages: {book.pages} · KES {book.pricePerPage}/page</div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section style={{ background: '#fff', padding: 20, borderRadius: 12, boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
          <h2>Reader</h2>
          {!selectedBook ? (
            <p>Select a book to continue.</p>
          ) : (
            <>
              <div style={{ marginBottom: 16, padding: 16, border: '1px solid #e5e7eb', borderRadius: 12 }}>
                <h3>{selectedBook.title}</h3>
                <p>{selectedBook.author}</p>
                <p>Pages: {selectedBook.pages}</p>
                <p>Price per page: KES {selectedBook.pricePerPage}</p>
                {selectedBook.paymentDestination?.type && selectedBook.paymentDestination.type !== 'default' && (
                  <p>Payment destination: {selectedBook.paymentDestination.type === 'mpesa_phone' ? `M-Pesa ${selectedBook.paymentDestination.value}` : `Bank ${selectedBook.paymentDestination.value}`}</p>
                )}
                <p>Purchased pages: {selectedBookDetails?.purchasedPages?.length ?? 0}</p>
                {selectedBook.filePath && (
                  <p>
                    <a href={`http://localhost:4000${selectedBook.filePath}`} target="_blank" rel="noreferrer">
                      Download original file
                    </a>
                  </p>
                )}
              </div>

              <div style={{ display: 'grid', gap: 12, marginBottom: 16 }}>
                <label>
                  Page to read
                  <input type="number" value={page} min="1" max={selectedBook.pages} onChange={(e) => setPage(Number(e.target.value))} />
                </label>
                <label>
                  Pages to buy from current page
                  <input type="number" value={pagesToBuy} min="1" max={Math.max(1, selectedBook.pages - page + 1)} onChange={(e) => setPagesToBuy(e.target.value)} />
                </label>
                <label>
                  M-Pesa phone number
                  <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="2547XXXXXXXX" />
                </label>
                <div style={{ display: 'flex', gap: 12 }}>
                  <button type="button" onClick={purchasePages}>Pay with M-Pesa</button>
                  <button type="button" onClick={loadPage}>Load Page</button>
                </div>
              </div>

              {message && <p><strong>{message}</strong></p>}
              {pageContent && (
                <section>
                  <h3>Page {page}</h3>
                  <div style={{ whiteSpace: 'pre-wrap', border: '1px solid #e5e7eb', borderRadius: 12, padding: 16 }}>{pageContent}</div>
                </section>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}

export default App;
