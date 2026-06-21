Medicine.destroy_all

Medicine.create!([
  { name: "Vitamin C 500mg", price: 15.00, stock_quantity: 120, shelf_location: "Aisle 1, Shelf A" },
  { name: "Paracetamol 500mg", price: 5.00, stock_quantity: 300, shelf_location: "Aisle 1, Shelf C" },
  { name: "Amoxicillin 500mg", price: 45.00, stock_quantity: 50, shelf_location: "Aisle 3, Shelf B" },
  { name: "Ibuprofen 400mg", price: 12.50, stock_quantity: 85, shelf_location: "Aisle 2, Shelf A" }
])

puts "Successfully seeded database with medicines!"