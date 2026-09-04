# Clear out old inventory and order data to ensure clean IDs for the demo
OrderItem.destroy_all
Order.destroy_all
Batch.destroy_all
Medicine.destroy_all

# 1. Healthy Inventory Setup
vit_c = Medicine.create!(
  name: "Vitamin C 500mg",
  price: 15.00,
  shelf_location: "Aisle 1, Shelf A",
  stock_quantity: 120,
  unit: "Box"
)
Batch.create!(medicine: vit_c, batch_number: "VIT-2026-A", quantity: 100, expiry_date: Date.new(2028, 12, 31))
Batch.create!(medicine: vit_c, batch_number: "VIT-2026-B", quantity: 20, expiry_date: Date.new(2029, 6, 1))

# 2. Expiring Soon Scenario (Expires in 30 days)
para = Medicine.create!(
  name: "Paracetamol 500mg",
  price: 5.50,
  shelf_location: "Aisle 3, Shelf B",
  stock_quantity: 45,
  unit: "Strip"
)
Batch.create!(medicine: para, batch_number: "PARA-EXP-99", quantity: 45, expiry_date: Date.today + 30.days)

# 3. Expired On Shelf Warning Scenario (Expired 25 days ago)
ibu = Medicine.create!(
  name: "Ibuprofen 400mg",
  price: 12.50,
  shelf_location: "Aisle 2, Shelf A",
  stock_quantity: 15,
  unit: "Box"
)
Batch.create!(medicine: ibu, batch_number: "IBU-BAD-01", quantity: 15, expiry_date: Date.today - 25.days)

puts "Successfully seeded pharmacy inventory!"

# Target ONLY the costa_demo account (Leaves all existing accounts & passwords untouched)
demo_manager = Manager.find_or_initialize_by(username: "costa_demo")
demo_manager.password = "CostaDemo2026!"
demo_manager.password_confirmation = "CostaDemo2026!"
demo_manager.role = "owner"
demo_manager.must_change_password = false
demo_manager.save!

puts "costa_demo account updated successfully!"