# Clear out old data to ensure clean IDs
OrderItem.destroy_all
Order.destroy_all
Batch.destroy_all
Medicine.destroy_all

# 1. Healthy Inventory Setup
vit_c = Medicine.create!(name: "Vitamin C 500mg", price: 15.00, shelf_location: "Aisle 1, Shelf A")
Batch.create!(medicine: vit_c, batch_number: "VIT-2026-A", quantity: 100, expiry_date: Date.new(2028, 12, 31))
Batch.create!(medicine: vit_c, batch_number: "VIT-2026-B", quantity: 20, expiry_date: Date.new(2029, 06, 01))

# 2. Expiring Soon Scenario (Expires next month)
para = Medicine.create!(name: "Paracetamol 500mg", price: 5.50, shelf_location: "Aisle 3, Shelf B")
Batch.create!(medicine: para, batch_number: "PARA-EXP-99", quantity: 45, expiry_date: Date.today + 30.days)

# 3. Expired On Shelf Warning Scenario (Expired last month)
ibu = Medicine.create!(name: "Ibuprofen 400mg", price: 12.50, shelf_location: "Aisle 2, Shelf A")
Batch.create!(medicine: ibu, batch_number: "IBU-BAD-01", quantity: 15, expiry_date: Date.today - 25.days)

puts "Successfully seeded pharmacy inventory with multi-batch expiry metrics!"
Manager.find_or_create_by!(username: "admin") do |manager|
  manager.password = "rxlocal2026" # Choose whatever secure password you prefer!
endManager.find_or_create_by!(username: "admin") do |manager|
  manager.password = "rxlocal2026"
  manager.role = "owner"
end

Manager.find_or_create_by!(username: "counter") do |manager|
  manager.password = "rxlocal2026"
  manager.role = "counter"
end

Manager.find_or_create_by!(username: "cashier") do |manager|
  manager.password = "rxlocal2026"
  manager.role = "cashier"
end

puts "Successfully seeded managers!"