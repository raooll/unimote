class ApplicationRecord < ActiveRecord::Base
  primary_abstract_class

  # Columns that must never be searchable/filterable through Ransack (ActiveAdmin).
  RANSACK_BLOCKED = %w[encrypted_password reset_password_token jti].freeze

  def self.ransackable_attributes(_auth_object = nil)
    column_names - RANSACK_BLOCKED
  end

  def self.ransackable_associations(_auth_object = nil)
    reflect_on_all_associations.map { |a| a.name.to_s }
  end
end
