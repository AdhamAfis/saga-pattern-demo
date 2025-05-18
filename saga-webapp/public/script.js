// Connect to socket server
const socket = io();

// DOM Elements
const servicesStatus = document.getElementById('services-status');
const refreshStatusBtn = document.getElementById('refresh-status');
const createOrderForm = document.getElementById('create-order-form');
const addItemBtn = document.getElementById('add-item');
const orderItems = document.getElementById('order-items');
const sagaEventsContainer = document.getElementById('saga-events-container');
const eventsLog = document.getElementById('events-log');
const clearEventsBtn = document.getElementById('clear-events');
const serviceDetailsModal = new bootstrap.Modal(document.getElementById('service-details-modal'));
const serviceDetailsBody = document.getElementById('service-details-body');
const errorModal = new bootstrap.Modal(document.getElementById('error-modal'));
const errorModalBody = document.getElementById('error-modal-body');

// Control panel elements
const orderIdInput = document.getElementById('order-id-input');
const viewOrderBtn = document.getElementById('view-order-btn');
const failPaymentBtn = document.getElementById('fail-payment-btn');
const cancelOrderBtn = document.getElementById('cancel-order-btn');
const orderDetailsCard = document.getElementById('order-details-card');
const orderDetailsContent = document.getElementById('order-details-content');

// Educational Saga Testing elements
const sagaTestForm = document.getElementById('saga-test-form');
const failInventoryCheckbox = document.getElementById('fail-inventory-checkbox');
const failPaymentCheckbox = document.getElementById('fail-payment-checkbox');
const failShippingCheckbox = document.getElementById('fail-shipping-checkbox');
const testModeSwitch = document.getElementById('test-mode-switch');

// Track active orders for visualization
const activeOrders = new Map();
let lastEventPositions = {
  'order-service': 0,
  'inventory-service': 0,
  'payment-service': 0,
  'shipping-service': 0
};

// Store service statuses
const serviceStatusData = {};

// Track current order ID for saga visualization
let currentOrderId = null;

// Timer for saga events polling
let sagaEventTimer = null;

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  fetchServicesStatus();
  
  // Make an initial fetch of the saga events to check if the connection works
  fetchInitialEvents();
  
  // Set up refresh interval for service status
  setInterval(fetchServicesStatus, 10000); // Refresh every 10 seconds
  
  // Set up event handlers for test scenario buttons
  setupTestButtons();
  
  // Test mode toggle handler
  if (testModeSwitch) {
    testModeSwitch.addEventListener('change', function() {
      console.log('Test mode switch toggled to:', this.checked); // Debug log
      if (this.checked) {
        createOrderForm.style.display = 'none';
        sagaTestForm.style.display = 'block';
        
        // Debug check to see if the form is actually visible
        setTimeout(() => {
          console.log('Test form display:', sagaTestForm.style.display);
          console.log('Test form visible:', sagaTestForm.offsetParent !== null);
        }, 100);
      } else {
        createOrderForm.style.display = 'block';
        sagaTestForm.style.display = 'none';
      }
    });
  } else {
    console.warn('Test mode switch element not found!'); // Debug log
  }
  
  // Set up clear saga events button
  const clearSagaEventsBtn = document.getElementById('clear-saga-events');
  if (clearSagaEventsBtn) {
    clearSagaEventsBtn.addEventListener('click', () => {
      clearSagaEvents();
    });
  }
  
  // Clear events button
  if (clearEventsBtn) {
    clearEventsBtn.addEventListener('click', () => {
      clearEventLog();
    });
  }
  
  // Set up click handler for service items
  if (servicesStatus) {
    servicesStatus.addEventListener('click', (e) => {
      const serviceItem = e.target.closest('.service-item');
      if (serviceItem) {
        const serviceName = serviceItem.querySelector('span:first-child').innerText;
        showServiceDetails(serviceName);
      }
    });
  }
});

// Set up event handlers for test scenario buttons
function setupTestButtons() {
  // Test successful order
  const testSuccessBtn = document.getElementById('test-success-btn');
  if (testSuccessBtn) {
    testSuccessBtn.addEventListener('click', function(e) {
      e.preventDefault();
      console.log('Test success button clicked');
      createTestOrder(false, false, false);
    });
  }
  
  // Test inventory failure
  const testInventoryBtn = document.getElementById('test-inventory-btn');
  if (testInventoryBtn) {
    testInventoryBtn.addEventListener('click', function(e) {
      e.preventDefault();
      console.log('Test inventory failure button clicked');
      createTestOrder(true, false, false);
    });
  }
  
  // Test payment failure
  const testPaymentBtn = document.getElementById('test-payment-btn');
  if (testPaymentBtn) {
    testPaymentBtn.addEventListener('click', function(e) {
      e.preventDefault();
      console.log('Test payment failure button clicked');
      createTestOrder(false, true, false);
    });
  }
  
  // Test shipping failure
  const testShippingBtn = document.getElementById('test-shipping-btn');
  if (testShippingBtn) {
    testShippingBtn.addEventListener('click', function(e) {
      e.preventDefault();
      console.log('Test shipping failure button clicked');
      createTestOrder(false, false, true);
    });
  }
}

// Function to create a test order with specific failure flags
function createTestOrder(failInventory, failPayment, failShipping) {
  // Show a temporary message to indicate the request is being processed
  addEventToLog('System', 'Creating test order...', 'success');
  
  // Create a standard test order
  const testData = {
    customerId: 'test123',
    items: [{ productId: 'PROD-1', quantity: 1, price: 1200 }],
    failInventory,
    failPayment,
    failShipping
  };
  
  console.log('Creating test order with data:', testData);
  
  // Make a direct API call
  fetch('/api/saga/test-order', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(testData)
  })
  .then(response => {
    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }
    return response.json();
  })
  .then(data => {
    console.log('Received response from API:', data);
    
    if (data.success) {
      // Set the current order ID for visualization filtering
      currentOrderId = data.orderId;
      
      addEventToLog('System', `Order ${data.orderId} created successfully`);
      
      // Set the order ID in the control panel
      orderIdInput.value = data.orderId;
      
      // Clear previous events to start fresh with this order
      clearSagaEvents();
    } else {
      addEventToLog('Error', data.message || 'Unknown error occurred', 'error');
    }
  })
  .catch(error => {
    console.error('Error creating test order:', error);
    addEventToLog('Error', `API call failed: ${error.message}`, 'error');
    showErrorModal(`Error creating test order: ${error.message}`);
  });
}

// Initial check for saga events to ensure connectivity
function fetchInitialEvents() {
  fetch('/api/saga/events')
    .then(response => {
      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }
      return response.json();
    })
    .then(data => {
      console.log('Initial saga events fetch successful');
      // Clear any previous error messages
      const errorMessages = Array.from(eventsLog.querySelectorAll('.event-log-entry')).filter(
        entry => entry.textContent.includes('Warning: Could not connect to saga event service')
      );
      errorMessages.forEach(msg => msg.remove());
      
      // Start the timer for regular updates
      if (!sagaEventTimer) {
        sagaEventTimer = setInterval(fetchSagaEvents, 5000);
      }
    })
    .catch(error => {
      console.error('Error on initial saga events fetch:', error);
      // Display a warning to the user
      addEventToLog('System', 'Warning: Could not connect to saga event service. Some educational features may not work.', 'error');
      
      // Still start the timer with a fallback mechanism
      if (!sagaEventTimer) {
        sagaEventTimer = setInterval(() => {
          fetch('/api/saga/events')
            .then(response => {
              if (!response.ok) {
                throw new Error(`HTTP error! Status: ${response.status}`);
              }
              return response.json();
            })
            .then(data => {
              console.log('Saga events service reconnected');
              // Clear error messages on successful reconnection
              const errorMessages = Array.from(eventsLog.querySelectorAll('.event-log-entry')).filter(
                entry => entry.textContent.includes('Warning: Could not connect to saga event service')
              );
              errorMessages.forEach(msg => msg.remove());
              
              // Start fetching events normally
              fetchSagaEvents();
            })
            .catch(err => {
              console.error('Still cannot connect to saga events service:', err);
            });
        }, 10000);
      }
    });
}

// Socket events
socket.on('connect', () => {
  console.log('Connected to server');
  addEventToLog('System', 'Connected to server');
});

socket.on('disconnect', () => {
  console.log('Disconnected from server');
  addEventToLog('System', 'Disconnected from server');
});

socket.on('connect_error', (error) => {
  console.error('Socket connection error:', error);
  addEventToLog('Error', `Socket connection error: ${error.message}`, 'error');
});

socket.on('error', (error) => {
  console.error('Socket error:', error);
  addEventToLog('Error', error.message, 'error');
  
  // Show error modal if action is specified
  if (error.action) {
    showErrorModal(`${error.message}`);
  }
});

socket.on('action-success', (response) => {
  console.log('Action success:', response);
  addEventToLog('System', response.message, 'success');
});

socket.on('saga-event', (event) => {
  console.log('Saga event received:', event);
  addEventToLog(event.topic, JSON.stringify(event.data));
  visualizeSagaEvent(event);
});

socket.on('order-created', (response) => {
  console.log('Order created:', response);
  if (response.success) {
    // Set the current order ID for visualization filtering
    currentOrderId = response.orderId;
    
    addEventToLog('System', `Order ${response.orderId} created successfully`);
    createOrderForm.reset();
    // Add default order item after reset
    addOrderItem();
    // Set the order ID in the control panel
    orderIdInput.value = response.orderId;
    
    // Clear previous events to start fresh with this order
    clearSagaEvents();
  }
});

socket.on('orders-list', (orders) => {
  console.log('Orders retrieved:', orders);
  displayOrders(orders);
});

socket.on('order-details', (response) => {
  console.log('Order details received:', response);
  if (response.success && response.order) {
    // Update current order ID when viewing a specific order
    currentOrderId = response.order.orderId;
    displayOrderDetails(response.order);
    
    // Fetch events for this specific order
    fetchSagaEvents();
  } else {
    showErrorModal('Order not found');
  }
});

// Event Handlers
refreshStatusBtn.addEventListener('click', fetchServicesStatus);

createOrderForm.addEventListener('submit', (e) => {
  e.preventDefault();
  
  const customerId = document.getElementById('customerId').value;
  const itemElements = document.querySelectorAll('.product-item');
  const items = [];
  
  itemElements.forEach(itemElem => {
    const productIdEl = itemElem.querySelector('[name="productId"]');
    const quantityEl = itemElem.querySelector('[name="quantity"]');
    
    if (productIdEl && quantityEl) {
      const productId = productIdEl.value;
      const quantity = parseInt(quantityEl.value);
      
      // Get price based on product ID
      let price = 0;
      if (productId === 'PROD-1') price = 1200;
      else if (productId === 'PROD-2') price = 800;
      else if (productId === 'PROD-3') price = 500;
      
      if (productId && quantity && price) {
        items.push({ productId, quantity, price });
      }
    }
  });
  
  if (items.length === 0) {
    showErrorModal('Please add at least one item to your order');
    return;
  }
  
  const orderData = { customerId, items };
  console.log('Creating order:', orderData);
  socket.emit('create-order', orderData);
});

// Control panel event handlers
viewOrderBtn.addEventListener('click', () => {
  const orderId = orderIdInput.value.trim();
  if (!orderId) {
    showErrorModal('Please enter an order ID');
    return;
  }
  socket.emit('get-order', orderId);
});

failPaymentBtn.addEventListener('click', () => {
  const orderId = orderIdInput.value.trim();
  if (!orderId) {
    showErrorModal('Please enter an order ID');
    return;
  }
  
  if (confirm(`Are you sure you want to trigger a payment failure for order ${orderId}?`)) {
    socket.emit('fail-payment', orderId);
  }
});

cancelOrderBtn.addEventListener('click', () => {
  const orderId = orderIdInput.value.trim();
  if (!orderId) {
    showErrorModal('Please enter an order ID');
    return;
  }
  
  if (confirm(`Are you sure you want to cancel order ${orderId}?`)) {
    socket.emit('cancel-order', orderId);
  }
});

// Add item button event handler
addItemBtn.addEventListener('click', addOrderItem);

// Remove item button event handler (delegated event)
orderItems.addEventListener('click', (e) => {
  const removeButton = e.target.closest('.remove-item');
  if (removeButton) {
    const items = document.querySelectorAll('.product-item');
    if (items.length > 1) {
      removeButton.closest('.product-item').remove();
    } else {
      showErrorModal('You need at least one item in the order');
    }
  }
});

// Event Handlers for Educational Saga Testing
sagaTestForm.addEventListener('submit', (e) => {
  e.preventDefault();
  
  console.log('Test form submitted!'); // Debug log
  
  try {
    const customerId = document.getElementById('test-customerId')?.value || 'test123';
    const productId = document.getElementById('test-productId')?.value || 'PROD-1';
    const quantity = parseInt(document.getElementById('test-quantity')?.value || '1');
    
    // Get price based on product ID
    let price = 0;
    if (productId === 'PROD-1') price = 1200;
    else if (productId === 'PROD-2') price = 800;
    else if (productId === 'PROD-3') price = 500;
    
    const items = [{ productId, quantity, price }];
    
    const failInventory = document.getElementById('fail-inventory-checkbox')?.checked || false;
    const failPayment = document.getElementById('fail-payment-checkbox')?.checked || false;
    const failShipping = document.getElementById('fail-shipping-checkbox')?.checked || false;
    
    const testData = {
      customerId,
      items,
      failInventory,
      failPayment,
      failShipping
    };
    
    console.log('Creating test order with data:', testData); // Debug log
    
    // Show a temporary message to indicate the request is being processed
    addEventToLog('System', 'Test order request initiated...', 'success');
    
    // Try a direct HTTP request instead of socket
    fetch('/api/saga/test-order', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(testData)
    })
    .then(response => {
      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }
      return response.json();
    })
    .then(data => {
      console.log('Received response from API:', data);
      // Manually trigger the order-created handler
      if (data.success) {
        // Set the current order ID for visualization filtering
        currentOrderId = data.orderId;
        
        addEventToLog('System', `Order ${data.orderId} created successfully`);
        sagaTestForm.reset();
        
        // Set the order ID in the control panel
        orderIdInput.value = data.orderId;
        
        // Clear previous events to start fresh with this order
        clearSagaEvents();
      } else {
        addEventToLog('Error', data.message || 'Unknown error occurred', 'error');
      }
    })
    .catch(error => {
      console.error('Error calling test-order API:', error);
      addEventToLog('Error', `API call failed: ${error.message}`, 'error');
      showErrorModal(`Error creating test order: ${error.message}`);
    });
  } catch (error) {
    console.error('Error in test form submission:', error);
    showErrorModal(`Error creating test order: ${error.message}`);
  }
});

// Function to fetch saga events for educational purposes
function fetchSagaEvents() {
  // If no current order, don't fetch events
  if (!currentOrderId) {
    return;
  }
  
  fetch(`/api/saga/events?orderId=${currentOrderId}`)
    .then(response => {
      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }
      return response.json();
    })
    .then(data => {
      // Even if we get a response but data is invalid or missing, handle it gracefully
      if (!data || typeof data !== 'object') {
        console.warn('Received invalid data from saga events service');
        return;
      }
      
      // If data.success is explicitly false, log it but don't throw an error
      if (data.success === false) {
        console.warn('Saga events service reported failure:', data.message);
        return;
      }
      
      if (data.events && Array.isArray(data.events)) {
        // Only clear and replay if we actually have events
        if (data.events.length > 0) {
          // Clear existing events
          sagaEventsContainer.innerHTML = '';
          lastEventPositions = {
            'order-service': 0,
            'inventory-service': 0,
            'payment-service': 0,
            'shipping-service': 0
          };
          
          // Replay only events for this order
          data.events.forEach(event => {
            // Check if this event belongs to the current order
            if (event.data && (event.data.orderId === currentOrderId || !event.data.orderId)) {
              // Add to event log if not already there
              const eventExists = Array.from(eventsLog.querySelectorAll('.event-log-entry')).some(
                entry => entry.textContent.includes(event.topic) && entry.textContent.includes(JSON.stringify(event.data))
              );
              
              if (!eventExists) {
                addEventToLog(event.type + ': ' + event.topic, JSON.stringify(event.data));
              }
              
              // Create a synthetic event for visualization
              visualizeSagaEvent({
                topic: event.topic,
                data: event.data
              });
            }
          });
        }
      } else {
        console.warn('Saga events service returned no events array');
      }
    })
    .catch(error => {
      console.error('Error fetching saga events:', error);
      // Don't clear the interval, as it would stop future attempts
      // Instead, just log the error and continue trying
    });
}

// Add button for educational features to clear event history
const clearEventsButton = document.getElementById('clear-events');
if (clearEventsButton) {
  clearEventsButton.addEventListener('click', () => {
    fetch('/api/saga/clear-history', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      }
    })
    .then(response => {
      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }
      return response.json();
    })
    .then(data => {
      if (data.success) {
        console.log('Saga event history cleared');
        eventsLog.innerHTML = '';
        sagaEventsContainer.innerHTML = '';
        lastEventPositions = {
          'order-service': 0,
          'inventory-service': 0,
          'payment-service': 0,
          'shipping-service': 0
        };
      }
    })
    .catch(error => {
      console.error('Error clearing saga event history:', error);
      showErrorModal('Failed to clear event history');
    });
  });
} else {
  console.warn('Clear events button not found in the DOM');
}

// Helper Functions
function fetchServicesStatus() {
  // Add loading state to refresh button
  refreshStatusBtn.disabled = true;
  refreshStatusBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1" role="status"></span>Refreshing...';
  
  fetch('/services-status')
    .then(response => response.json())
    .then(services => {
      updateServicesStatus(services);
      
      // Store service status data
      services.forEach(service => {
        serviceStatusData[service.name] = service;
      });
      
      // Reset refresh button
      refreshStatusBtn.disabled = false;
      refreshStatusBtn.innerHTML = '<i class="bi bi-arrow-clockwise me-1"></i>Refresh';
    })
    .catch(error => {
      console.error('Error fetching services status:', error);
      addEventToLog('Error', 'Failed to fetch services status');
      
      // Reset refresh button
      refreshStatusBtn.disabled = false;
      refreshStatusBtn.innerHTML = '<i class="bi bi-arrow-clockwise me-1"></i>Retry';
    });
}

function updateServicesStatus(services) {
  const statusItems = servicesStatus.querySelectorAll('li');
  
  services.forEach((service, index) => {
    const statusBadge = statusItems[index].querySelector('.status-badge');
    const isUp = service.status.toLowerCase() === 'up';
    
    statusBadge.className = `status-badge ${isUp ? 'up' : 'down'}`;
    
    if (isUp) {
      statusBadge.innerHTML = '<i class="bi bi-check-circle-fill me-1"></i>UP';
    } else {
      statusBadge.innerHTML = '<i class="bi bi-exclamation-triangle-fill me-1"></i>DOWN';
    }
    
    // Update the service item to indicate it can be clicked
    statusItems[index].title = "Click for details";
  });
}

function showServiceDetails(serviceName) {
  const service = serviceStatusData[serviceName];
  
  if (!service) {
    return;
  }
  
  let detailsHTML = `<h6>${serviceName}</h6>`;
  
  detailsHTML += `<table class="service-details-table">
    <tr>
      <td>Status</td>
      <td>
        <span class="status-badge ${service.status.toLowerCase() === 'up' ? 'up' : 'down'}">
          ${service.status}
        </span>
      </td>
    </tr>
    <tr>
      <td>Port</td>
      <td>${service.port}</td>
    </tr>`;
  
  // Add additional details if available
  if (service.details) {
    const details = service.details;
    
    if (details.timestamp) {
      detailsHTML += `
      <tr>
        <td>Last Updated</td>
        <td>${new Date(details.timestamp).toLocaleString()}</td>
      </tr>`;
    }
    
    if (details.service) {
      detailsHTML += `
      <tr>
        <td>Service ID</td>
        <td>${details.service}</td>
      </tr>`;
    }
  }
  
  detailsHTML += `</table>`;
  
  serviceDetailsBody.innerHTML = detailsHTML;
  serviceDetailsModal.show();
}

function displayOrderDetails(order) {
  // Show the order details card
  orderDetailsCard.style.display = 'block';
  
  // Format the order details
  let detailsHTML = `
    <div class="mb-3">
      <h5 class="border-bottom pb-2">Order Information</h5>
      <table class="table">
        <tr>
          <td><strong>Order ID:</strong></td>
          <td>${order.orderId}</td>
        </tr>
        <tr>
          <td><strong>Customer ID:</strong></td>
          <td>${order.customerId}</td>
        </tr>
        <tr>
          <td><strong>Status:</strong></td>
          <td><span class="badge ${getStatusClass(order.status)}">${order.status}</span></td>
        </tr>
        <tr>
          <td><strong>Created:</strong></td>
          <td>${new Date(order.createdAt).toLocaleString()}</td>
        </tr>
        <tr>
          <td><strong>Total Amount:</strong></td>
          <td>$${order.totalAmount.toFixed(2)}</td>
        </tr>`;
  
  // Add shipping ID if available
  if (order.shippingId) {
    detailsHTML += `
        <tr>
          <td><strong>Shipping ID:</strong></td>
          <td>${order.shippingId}</td>
        </tr>`;
  }
  
  // Add failure reason if available
  if (order.reason) {
    detailsHTML += `
        <tr>
          <td><strong>Failure Reason:</strong></td>
          <td class="text-danger">${order.reason}</td>
        </tr>`;
  }
  
  detailsHTML += `
      </table>
    </div>`;
  
  // Add order items table if available
  if (order.items && order.items.length > 0) {
    detailsHTML += `
    <div>
      <h5 class="border-bottom pb-2">Order Items</h5>
      <table class="table table-striped">
        <thead>
          <tr>
            <th>Product ID</th>
            <th>Quantity</th>
            <th>Price</th>
            <th>Total</th>
          </tr>
        </thead>
        <tbody>`;
    
    order.items.forEach(item => {
      const itemTotal = item.price * item.quantity;
      detailsHTML += `
          <tr>
            <td>${item.productId}</td>
            <td>${item.quantity}</td>
            <td>$${item.price.toFixed(2)}</td>
            <td>$${itemTotal.toFixed(2)}</td>
          </tr>`;
    });
    
    detailsHTML += `
        </tbody>
      </table>
    </div>`;
  }
  
  orderDetailsContent.innerHTML = detailsHTML;
  
  // Scroll to the order details card
  orderDetailsCard.scrollIntoView({ behavior: 'smooth' });
}

function showErrorModal(message) {
  errorModalBody.innerHTML = `<p class="mb-0">${message}</p>`;
  errorModal.show();
}

function addOrderItem() {
  const newItem = document.createElement('div');
  newItem.className = 'product-item';
  
  newItem.innerHTML = `
    <select name="productId" class="form-select">
      <option value="PROD-1">Laptop ($1200)</option>
      <option value="PROD-2">Phone ($800)</option>
      <option value="PROD-3">Tablet ($500)</option>
    </select>
    <input type="number" name="quantity" class="form-control" min="1" value="1" required>
    <button type="button" class="btn btn-sm btn-outline-danger remove-item">
      <i class="bi bi-dash"></i>
    </button>
  `;
  
  orderItems.appendChild(newItem);
}

function addEventToLog(topic, data, type = 'normal') {
  const logEntry = document.createElement('div');
  logEntry.className = 'event-log-entry';
  
  // Determine topic class
  let topicClass = '';
  if (topic.includes('order')) topicClass = 'order';
  else if (topic.includes('inventory')) topicClass = 'inventory';
  else if (topic.includes('payment')) topicClass = 'payment';
  else if (topic.includes('shipping')) topicClass = 'shipping';
  else if (topic.includes('release') || topic.includes('refund') || topic.includes('cancel')) {
    topicClass = 'compensation';
  }
  
  logEntry.innerHTML = `
    <span class="event-log-time">${new Date().toLocaleTimeString()}</span>
    <span class="event-log-topic ${topicClass}">${topic}:</span>
    <span class="event-log-data">${data}</span>
  `;
  
  eventsLog.insertBefore(logEntry, eventsLog.firstChild);
}

function visualizeSagaEvent(event) {
  const { topic, data } = event;
  
  // Skip events not related to the current order
  if (data && data.orderId && data.orderId !== currentOrderId) {
    return;
  }
  
  let sourceService = 'order-service';
  let targetService = 'inventory-service';
  let isCompensation = false;
  
  // Determine source and target services based on the topic
  if (topic === 'order-created') {
    sourceService = 'order-service';
    targetService = 'inventory-service';
  } else if (topic === 'inventory-reserved' || topic === 'inventory-response') {
    sourceService = 'inventory-service';
    targetService = topic === 'inventory-response' ? 'order-service' : 'payment-service';
  } else if (topic === 'payment-completed' || topic === 'payment-response') {
    sourceService = 'payment-service';
    targetService = topic === 'payment-response' ? 'order-service' : 'shipping-service';
  } else if (topic === 'shipping-response') {
    sourceService = 'shipping-service';
    targetService = 'order-service';
  } else if (topic === 'release-inventory') {
    sourceService = 'order-service';
    targetService = 'inventory-service';
    isCompensation = true;
  } else if (topic === 'refund-payment') {
    sourceService = 'order-service';
    targetService = 'payment-service';
    isCompensation = true;
  } else if (topic === 'cancel-shipping') {
    sourceService = 'order-service';
    targetService = 'shipping-service';
    isCompensation = true;
  } else if (topic === 'payment-failed') {
    sourceService = 'payment-service';
    targetService = 'order-service';
    isCompensation = true;
  } else if (topic === 'order-cancelled') {
    sourceService = 'order-service';
    targetService = 'order-service'; // Self-directed event
    isCompensation = true;
  }
  
  createSagaEventVisual(topic, data, sourceService, targetService, isCompensation);
}

function createSagaEventVisual(topic, data, sourceService, targetService, isCompensation = false) {
  const eventElement = document.createElement('div');
  eventElement.className = 'saga-event';
  
  // Calculate positions
  const sourcePos = document.getElementById(sourceService).getBoundingClientRect();
  const targetPos = document.getElementById(targetService).getBoundingClientRect();
  
  const sourceY = sourcePos.top + sourcePos.height / 2;
  const targetY = targetPos.top + targetPos.height / 2;
  
  // Update event positions to avoid overlapping
  lastEventPositions[sourceService] += 20;
  if (lastEventPositions[sourceService] > 80) {
    lastEventPositions[sourceService] = 0;
  }
  
  // Create content
  const eventContent = document.createElement('div');
  eventContent.className = 'saga-event-content';
  
  // Style based on source service
  if (sourceService === 'order-service') {
    eventContent.style.borderLeft = '4px solid var(--order-color)';
  } else if (sourceService === 'inventory-service') {
    eventContent.style.borderLeft = '4px solid var(--inventory-color)';
  } else if (sourceService === 'payment-service') {
    eventContent.style.borderLeft = '4px solid var(--payment-color)';
  } else if (sourceService === 'shipping-service') {
    eventContent.style.borderLeft = '4px solid var(--shipping-color)';
  }
  
  // Add compensation styling if needed
  if (isCompensation) {
    eventContent.style.borderRight = '4px solid var(--compensation-color)';
  }
  
  // Add success/error styling based on data
  if (data && data.success !== undefined) {
    eventContent.style.borderTop = `2px solid ${data.success ? 'var(--success-color)' : 'var(--error-color)'}`;
  }
  
  eventContent.innerHTML = `
    <div class="saga-event-header">
      <span>${formatTopicName(topic)}</span>
      <span class="saga-event-topic">${topic}</span>
    </div>
    <div class="saga-event-data">
      ${formatDataDisplay(data)}
    </div>
  `;
  
  eventElement.appendChild(eventContent);
  sagaEventsContainer.appendChild(eventElement);
  
  // Auto-scroll to bottom
  sagaEventsContainer.scrollTop = sagaEventsContainer.scrollHeight;
}

function formatTopicName(topic) {
  return topic.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
}

function formatDataDisplay(data) {
  if (!data) return 'No data';
  
  if (typeof data === 'string') {
    try {
      data = JSON.parse(data);
    } catch (e) {
      return data;
    }
  }
  
  const keys = Object.keys(data);
  return keys.map(key => {
    const value = data[key];
    if (value === null || value === undefined) return '';
    if (typeof value === 'object') {
      return `<strong>${key}:</strong> ${JSON.stringify(value)}`;
    }
    return `<strong>${key}:</strong> ${value}`;
  }).join('<br>');
}

function displayOrders(orders) {
  const tableBody = document.getElementById('orders-table-body');
  tableBody.innerHTML = '';
  
  if (!orders || !orders.orders || orders.orders.length === 0) {
    const row = document.createElement('tr');
    row.innerHTML = '<td colspan="6" class="text-center">No orders found</td>';
    tableBody.appendChild(row);
    return;
  }
  
  orders.orders.forEach(order => {
    const row = document.createElement('tr');
    const statusClass = getStatusClass(order.status);
    
    row.innerHTML = `
      <td>${order.orderId}</td>
      <td>${order.customerId}</td>
      <td>$${order.totalAmount.toFixed(2)}</td>
      <td><span class="badge ${statusClass}">${order.status}</span></td>
      <td>${new Date(order.createdAt).toLocaleString()}</td>
      <td>
        <button class="btn btn-sm btn-outline-primary view-order" data-order-id="${order.orderId}">
          <i class="bi bi-eye"></i>
        </button>
        <button class="btn btn-sm btn-outline-danger cancel-order" data-order-id="${order.orderId}">
          <i class="bi bi-x-circle"></i>
        </button>
      </td>
    `;
    
    tableBody.appendChild(row);
  });
  
  // Add event listeners to order action buttons
  tableBody.querySelectorAll('.view-order').forEach(btn => {
    btn.addEventListener('click', () => {
      const orderId = btn.dataset.orderId;
      orderIdInput.value = orderId;
      socket.emit('get-order', orderId);
    });
  });
  
  tableBody.querySelectorAll('.cancel-order').forEach(btn => {
    btn.addEventListener('click', () => {
      const orderId = btn.dataset.orderId;
      if (confirm(`Are you sure you want to cancel order ${orderId}?`)) {
        orderIdInput.value = orderId;
        socket.emit('cancel-order', orderId);
      }
    });
  });
  
  // Show the modal
  const ordersModal = new bootstrap.Modal(document.getElementById('recent-orders-modal'));
  ordersModal.show();
}

function getStatusClass(status) {
  if (!status) return 'bg-secondary';
  
  status = status.toLowerCase();
  if (status === 'completed') return 'bg-success';
  if (status === 'failed') return 'bg-danger';
  if (status.includes('pending')) return 'bg-warning';
  return 'bg-primary';
}

// Function to clear saga events visualization
function clearSagaEvents() {
  if (sagaEventsContainer) {
    sagaEventsContainer.innerHTML = '<div class="empty-state"><i class="bi bi-arrow-left-circle"></i><p>Create an order to see the saga flow in action</p></div>';
    
    // Reset positions
    lastEventPositions = {
      'order-service': 0,
      'inventory-service': 0,
      'payment-service': 0,
      'shipping-service': 0
    };
  }
}

// Function to clear event log
function clearEventLog() {
  if (eventsLog) {
    eventsLog.innerHTML = '<div class="empty-state">No events recorded yet</div>';
  }
} 