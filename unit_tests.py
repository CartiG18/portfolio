'''
Author: Carter Gladden
Date: 2025-05-05
Unit tests
'''
import unittest

def is_palindrome(word):
  """
  Checks whether a word is a palindrome.

  Args:
    word: The word to check.

  Returns:
    True if the word is a palindrome, False otherwise.
  """

  # Convert the word to lowercase and remove non-alphanumeric characters.
  word = ''.join(char.lower() for char in word if char.isalnum())

  # Check if the word is the same forwards and backwards.
  return word == word[::-1]

class TestIsPalindrome(unittest.TestCase):
  def test_empty_string(self): #Test with an empty string
    self.assertTrue(is_palindrome("")) #Should return True

  def test_single_character(self): # Test with a single character
    self.assertTrue(is_palindrome("a")) #Should return True

  def test_simple_palindrome(self):  # Test with a simple palindrome
    self.assertTrue(is_palindrome("madam")) #Should return True

  def test_palindrome_with_spaces(self):  #Test with spaces
    self.assertTrue(is_palindrome("Race car")) #Should return True

  def test_palindrome_with_punctuation(self):  # Test with punctuation
    self.assertTrue(is_palindrome("A man, a plan, a canal: Panama")) #Should return True

  def test_not_a_palindrome(self):  # Test with a word that is not a palindrome
    self.assertFalse(is_palindrome("hello")) #Should return False

  def test_case_insensitive(self):  # Test case-insensitive palindrome
    self.assertTrue(is_palindrome("Madam")) #Should return True

  def test_numbers_and_letters(self): # Test with numbers and letters
    self.assertTrue(is_palindrome("12321")) #Should return True

  def test_palindrome_with_special_characters(self): #Test with special characters
      self.assertTrue(is_palindrome("No 'x' in Nixon")) #Should return True

  def test_long_palindrome(self): #Test with a long palindrome
      self.assertTrue(is_palindrome("A Toyota's a Toyota")) #Should return True


if __name__ == '__main__':
  unittest.main()
