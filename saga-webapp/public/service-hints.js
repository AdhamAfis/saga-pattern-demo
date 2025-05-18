// Service Hints for Testing
document.addEventListener('DOMContentLoaded', function() {
  const productIdInputs = document.querySelectorAll('input[name="productId"]');
  
  const updateHint = function(input) {
    let hintElement = input.parentElement.querySelector('.product-hint');
    if (!hintElement) {
      hintElement = document.createElement('div');
      hintElement.className = 'product-hint text-muted small mt-1';
      input.parentElement.appendChild(hintElement);
    }
    
    const productId = input.value.trim();
    if (productId === 'FAIL-INV') {
      hintElement.innerHTML = '<i class="bi bi-info-circle"></i> Will trigger inventory failure';
      hintElement.classList.add('text-danger');
    } else if (productId === 'FAIL-PAY') {
      hintElement.innerHTML = '<i class="bi bi-info-circle"></i> Will trigger payment failure';
      hintElement.classList.add('text-danger');
    } else if (productId === 'FAIL-SHIP') {
      hintElement.innerHTML = '<i class="bi bi-info-circle"></i> Will trigger shipping failure';
      hintElement.classList.add('text-danger');
    } else {
      hintElement.innerHTML = '';
    }
  };
  
  // Update hints on page load
  productIdInputs.forEach(updateHint);
  
  // Add event listeners for new product ID inputs
  document.addEventListener('input', function(e) {
    if (e.target.matches('input[name="productId"]')) {
      updateHint(e.target);
    }
  });
  
  // Also handle dynamically added items
  document.getElementById('add-item').addEventListener('click', function() {
    setTimeout(function() {
      const newInputs = document.querySelectorAll('input[name="productId"]');
      newInputs.forEach(updateHint);
    }, 100);
  });
}); 